import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger.js';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    // Only protect /api/* routes if DASHBOARD_API_KEY is configured
    if (!process.env.DASHBOARD_API_KEY) {
        logger.warn('DASHBOARD_API_KEY is not set. API is running without authentication!');
        return next();
    }

    const apiKey = req.header('x-api-key');

    if (!apiKey || apiKey !== process.env.DASHBOARD_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing X-API-Key header' });
    }

    next();
};
