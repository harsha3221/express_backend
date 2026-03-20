/**
 * Global Error Handler Middleware
 * Catches all unhandled exceptions thrown by asynchronous controllers.
 */
const errorHandler = (err, req, res, next) => {
    console.error(`[Error] ${err.message || 'Unknown Error'}`);

    // Log the full stack trace in development
    if (process.env.NODE_ENV !== 'production') {
        console.error(err.stack);
    }

    const statusCode = err.statusCode || err.code || 500;

    // Ensure we send a valid HTTP status code
    const validStatusCode = (typeof statusCode === 'number' && statusCode >= 100 && statusCode < 600)
        ? statusCode
        : 500;

    res.status(validStatusCode).json({
        success: false,
        message: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
};

module.exports = errorHandler;
