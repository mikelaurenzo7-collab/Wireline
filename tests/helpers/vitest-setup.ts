/**
 * Vitest global setup — mirrors production async error forwarding so route
 * tests that throw AppError reach the mounted error handler.
 */
import "express-async-errors";
