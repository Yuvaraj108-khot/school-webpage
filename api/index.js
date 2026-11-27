let app;
let initError = null;

try {
    app = require('../backend/server');
} catch (err) {
    initError = err;
    console.error('[Vercel Serverless Error] Failed to initialize backend server:', err);
}

module.exports = (req, res) => {
    if (initError) {
        return res.status(500).json({
            error: 'Backend initialization failed on Vercel',
            message: initError.message,
            stack: initError.stack
        });
    }
    return app(req, res);
};
