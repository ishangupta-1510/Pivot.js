import { Request, Response } from 'express';
import { z } from 'zod';
import { database } from '../config/database';
import { logger } from '../utils/logger';

// Extend Request type to include user
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

// Validation schemas
const createDashboardSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  config: z.record(z.any()),
  expectedFields: z.array(z.any()).optional(),
  dataSourceType: z.enum(['csv', 'api', 'database', 'manual']).optional(),
  layout: z.record(z.any()).optional(),
  theme: z.string().optional(),
  isPublic: z.boolean().optional(),
  isTemplate: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

const updateDashboardSchema = createDashboardSchema.partial();

class DashboardControllerClass {
  /**
   * Get all dashboards for the current user
   */
  async listDashboards(req: AuthenticatedRequest, res: Response) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        sortBy = 'updated_at', 
        order = 'DESC',
        search,
        tags,
        isTemplate
      } = req.query;

      const offset = (Number(page) - 1) * Number(limit);

      let query = `
        SELECT 
          id,
          name,
          description,
          config,
          expected_fields,
          data_source_type,
          theme,
          created_by,
          created_at,
          updated_at,
          last_accessed_at,
          access_count,
          is_public,
          is_template,
          tags
        FROM public.dashboards
        WHERE deleted_at IS NULL
      `;

      const params: any[] = [];
      let paramCount = 1;

      // Add search filter
      if (search) {
        query += ` AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
        params.push(`%${search}%`);
        paramCount++;
      }

      // Add tags filter
      if (tags) {
        const tagArray = Array.isArray(tags) ? tags : [tags];
        query += ` AND tags && $${paramCount}::text[]`;
        params.push(tagArray);
        paramCount++;
      }

      // Add template filter
      if (isTemplate !== undefined) {
        query += ` AND is_template = $${paramCount}`;
        params.push(isTemplate === 'true');
        paramCount++;
      }

      // Add sorting
      const validSortColumns = ['name', 'created_at', 'updated_at', 'last_accessed_at', 'access_count'];
      const sortColumn = validSortColumns.includes(String(sortBy)) ? sortBy : 'updated_at';
      const sortOrder = String(order).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      query += ` ORDER BY ${sortColumn} ${sortOrder}`;

      // Add pagination
      query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(Number(limit), offset);

      // Get total count for pagination
      let countQuery = `
        SELECT COUNT(*) FROM public.dashboards
        WHERE deleted_at IS NULL
      `;

      const countParams = params.slice(0, -2); // Exclude limit and offset

      const [results, countResult] = await Promise.all([
        database.query(query, params),
        database.query(countQuery, countParams)
      ]);

      const total = parseInt(countResult.rows[0].count);

      const response = {
        success: true,
        data: {
          dashboards: results.rows || [],
          pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / Number(limit)),
            hasNext: offset + Number(limit) < total,
            hasPrev: Number(page) > 1
          }
        }
      };

      res.json(response);
    } catch (error) {
      logger.error('Failed to list dashboards:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve dashboards'
      });
    }
  }

  /**
   * Get a single dashboard by ID
   */
  async getDashboard(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;

      const query = `
        SELECT 
          id,
          name,
          description,
          config,
          expected_fields,
          data_source_type,
          layout,
          theme,
          created_by,
          created_at,
          updated_at,
          last_accessed_at,
          access_count,
          is_public,
          is_template,
          tags
        FROM public.dashboards
        WHERE id = $1 AND deleted_at IS NULL
      `;

      const result = await database.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Dashboard not found'
        });
      }

      // Update access count and last accessed timestamp
      await database.query(
        `UPDATE public.dashboards 
         SET last_accessed_at = CURRENT_TIMESTAMP, 
             access_count = access_count + 1 
         WHERE id = $1`,
        [id]
      );

      const response = {
        success: true,
        data: result.rows[0]
      };

      res.json(response);
    } catch (error) {
      logger.error('Failed to get dashboard:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve dashboard'
      });
    }
  }

  /**
   * Create a new dashboard
   */
  async createDashboard(req: AuthenticatedRequest, res: Response) {
    try {
      const validatedData = createDashboardSchema.parse(req.body);

      const query = `
        INSERT INTO public.dashboards (
          name,
          description,
          config,
          expected_fields,
          data_source_type,
          layout,
          theme,
          is_public,
          is_template,
          tags,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const values = [
        validatedData.name,
        validatedData.description || null,
        JSON.stringify(validatedData.config),
        JSON.stringify(validatedData.expectedFields || []),
        validatedData.dataSourceType || 'manual',
        JSON.stringify(validatedData.layout || {}),
        validatedData.theme || 'default',
        validatedData.isPublic || false,
        validatedData.isTemplate || false,
        validatedData.tags || [],
        req.user?.id || 'anonymous',
      ];

      const result = await database.query(query, values);

      logger.info('Dashboard created', { 
        dashboardId: result.rows[0].id,
        name: validatedData.name,
        userId: req.user?.id,
      });

      const response = {
        success: true,
        data: result.rows[0]
      };

      res.status(201).json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
      }

      logger.error('Failed to create dashboard:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create dashboard'
      });
    }
  }

  /**
   * Update an existing dashboard
   */
  async updateDashboard(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const validatedData = updateDashboardSchema.parse(req.body);

      // Check if dashboard exists
      const existingQuery = `
        SELECT id FROM public.dashboards 
        WHERE id = $1 AND deleted_at IS NULL
      `;
      const existing = await database.query(existingQuery, [id]);

      if (existing.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Dashboard not found'
        });
      }

      // Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (validatedData.name !== undefined) {
        updates.push(`name = $${paramCount}`);
        values.push(validatedData.name);
        paramCount++;
      }

      if (validatedData.description !== undefined) {
        updates.push(`description = $${paramCount}`);
        values.push(validatedData.description);
        paramCount++;
      }

      if (validatedData.config !== undefined) {
        updates.push(`config = $${paramCount}`);
        values.push(JSON.stringify(validatedData.config));
        paramCount++;
      }

      if (validatedData.expectedFields !== undefined) {
        updates.push(`expected_fields = $${paramCount}`);
        values.push(JSON.stringify(validatedData.expectedFields));
        paramCount++;
      }

      if (validatedData.dataSourceType !== undefined) {
        updates.push(`data_source_type = $${paramCount}`);
        values.push(validatedData.dataSourceType);
        paramCount++;
      }

      if (validatedData.layout !== undefined) {
        updates.push(`layout = $${paramCount}`);
        values.push(JSON.stringify(validatedData.layout));
        paramCount++;
      }

      if (validatedData.theme !== undefined) {
        updates.push(`theme = $${paramCount}`);
        values.push(validatedData.theme);
        paramCount++;
      }

      if (validatedData.isPublic !== undefined) {
        updates.push(`is_public = $${paramCount}`);
        values.push(validatedData.isPublic);
        paramCount++;
      }

      if (validatedData.isTemplate !== undefined) {
        updates.push(`is_template = $${paramCount}`);
        values.push(validatedData.isTemplate);
        paramCount++;
      }

      if (validatedData.tags !== undefined) {
        updates.push(`tags = $${paramCount}`);
        values.push(validatedData.tags);
        paramCount++;
      }

      // Add the ID as the last parameter
      values.push(id);

      const query = `
        UPDATE public.dashboards
        SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramCount} AND deleted_at IS NULL
        RETURNING *
      `;

      const result = await database.query(query, values);

      logger.info('Dashboard updated', { 
        dashboardId: id,
        updates: updates.length,
        userId: req.user?.id,
      });

      const response = {
        success: true,
        data: result.rows[0]
      };

      res.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
      }

      logger.error('Failed to update dashboard:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update dashboard'
      });
    }
  }

  /**
   * Delete a dashboard (soft delete)
   */
  async deleteDashboard(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;

      const query = `
        UPDATE public.dashboards
        SET deleted_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, name
      `;

      const result = await database.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Dashboard not found'
        });
      }

      logger.info('Dashboard deleted', { 
        dashboardId: id,
        name: result.rows[0].name,
        userId: req.user?.id,
      });

      const response = {
        success: true,
        message: 'Dashboard deleted successfully',
        data: { id: result.rows[0].id }
      };

      res.json(response);
    } catch (error) {
      logger.error('Failed to delete dashboard:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete dashboard'
      });
    }
  }

  /**
   * Duplicate a dashboard
   */
  async duplicateDashboard(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name } = req.body;

      // Get the original dashboard
      const originalQuery = `
        SELECT * FROM public.dashboards
        WHERE id = $1 AND deleted_at IS NULL
      `;
      const originalResult = await database.query(originalQuery, [id]);

      if (originalResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Dashboard not found'
        });
      }

      const original = originalResult.rows[0];

      // Create duplicate with new name
      const duplicateQuery = `
        INSERT INTO public.dashboards (
          name,
          description,
          config,
          expected_fields,
          data_source_type,
          layout,
          theme,
          is_public,
          is_template,
          tags,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const duplicateName = name || `${original.name} (Copy)`;
      const values = [
        duplicateName,
        original.description,
        original.config,
        original.expected_fields,
        original.data_source_type,
        original.layout,
        original.theme,
        false, // New dashboard is private by default
        false, // Not a template
        original.tags,
        req.user?.id || 'anonymous',
      ];

      const result = await database.query(duplicateQuery, values);

      logger.info('Dashboard duplicated', { 
        originalId: id,
        newId: result.rows[0].id,
        name: duplicateName,
        userId: req.user?.id,
      });

      const response = {
        success: true,
        data: result.rows[0]
      };

      res.status(201).json(response);
    } catch (error) {
      logger.error('Failed to duplicate dashboard:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to duplicate dashboard'
      });
    }
  }
}

// Export singleton instance
export const DashboardController = new DashboardControllerClass();