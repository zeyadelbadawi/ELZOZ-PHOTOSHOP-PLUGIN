/**
 * Error Handler Service
 * Centralized error management and user-friendly messaging
 */

export const ErrorHandler = {
    /**
     * Error category mapping
     */
    CATEGORIES: {
        LAYER_NOT_FOUND: 'layer_not_found',
        NOT_TEXT_LAYER: 'not_text_layer',
        PHOTOSHOP_DISCONNECTED: 'photoshop_disconnected',
        INVALID_DATA: 'invalid_data',
        FILE_ERROR: 'file_error',
        INSUFFICIENT_CREDITS: 'insufficient_credits',
        UNKNOWN: 'unknown'
    },

    /**
     * User-friendly error messages
     */
    MESSAGES: {
        layer_not_found: 'Layer not found in the PSD file. Check your mapping.',
        not_text_layer: 'The mapped layer is not a text layer.',
        photoshop_disconnected: 'Lost connection to Photoshop. Please check the application.',
        invalid_data: 'Invalid data in Excel. Check cell formatting.',
        file_error: 'File system error. Check file permissions.',
        insufficient_credits: 'Not enough credits to process all items.',
        unknown: 'An unexpected error occurred. Please try again.'
    },

    /**
     * Categorize an error
     */
    categorizeError(error) {
        if (!error) return this.CATEGORIES.UNKNOWN;

        const message = error.message?.toLowerCase() || '';
        const reason = error.reason?.toLowerCase() || '';

        if (message.includes('layer') && message.includes('not found')) {
            return this.CATEGORIES.LAYER_NOT_FOUND;
        }
        if (reason === 'not_text_layer' || message.includes('not a text layer')) {
            return this.CATEGORIES.NOT_TEXT_LAYER;
        }
        if (message.includes('no active document') || message.includes('photoshop')) {
            return this.CATEGORIES.PHOTOSHOP_DISCONNECTED;
        }
        if (message.includes('invalid') || message.includes('format')) {
            return this.CATEGORIES.INVALID_DATA;
        }
        if (message.includes('file') || message.includes('permission')) {
            return this.CATEGORIES.FILE_ERROR;
        }
        if (message.includes('credit')) {
            return this.CATEGORIES.INSUFFICIENT_CREDITS;
        }

        return this.CATEGORIES.UNKNOWN;
    },

    /**
     * Get user-friendly message for an error
     */
    getUserMessage(error) {
        const category = this.categorizeError(error);
        return this.MESSAGES[category] || this.MESSAGES.unknown;
    },

    /**
     * Format error for logging
     */
    formatError(error, context = {}) {
        return {
            message: error.message || 'Unknown error',
            category: this.categorizeError(error),
            userMessage: this.getUserMessage(error),
            details: {
                ...context,
                timestamp: new Date().toISOString()
            }
        };
    },

    /**
     * Handle row-level error with recovery suggestions
     */
    handleRowError(rowNumber, error, context = {}) {
        const formatted = this.formatError(error, context);

        return {
            row: rowNumber,
            ...formatted,
            action: this.suggestRecovery(formatted.category, context)
        };
    },

    /**
     * Suggest recovery action based on error type
     */
    suggestRecovery(category, context = {}) {
        const suggestions = {
            layer_not_found: 'skip',
            not_text_layer: 'skip',
            photoshop_disconnected: 'pause',
            invalid_data: 'skip',
            file_error: 'pause',
            insufficient_credits: 'stop',
            unknown: 'skip'
        };

        return suggestions[category] || 'skip';
    }
};

export default ErrorHandler;
