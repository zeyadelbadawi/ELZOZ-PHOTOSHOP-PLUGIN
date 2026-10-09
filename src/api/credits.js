// Credits API Utilities
// These are helper functions for credit operations

import { CreditService } from '../services/CreditService';

/**
 * Check user balance
 */
export async function getUserBalance(userId) {

    try {
        const result = await CreditService.getBalance(userId);
        return result;
    } catch (error) {
        console.error('  Credits API: Error getting balance:', error.message);
        return {
            credits: 0,
            status: 'error'
        };
    }
}

/**
 * Check if user has enough credits
 */
export async function checkSufficientCredits(userId, creditsNeeded = 1) {

    try {
        const result = await CreditService.hasEnoughCredits(userId, creditsNeeded);
        return result;
    } catch (error) {
        console.error('  Credits API: Error checking credits:', error.message);
        return {
            hasCredits: false,
            currentCredits: 0,
            creditsNeeded
        };
    }
}

/**
 * Deduct credits for execution
 */
export async function deductExecutionCredits(userId, executionDetails = {}) {

    try {
        const result = await CreditService.deductCredits(userId, 1, {
            ...executionDetails,
            action: 'batch_processing'
        });

        return result;
    } catch (error) {
        console.error('  Credits API: Error deducting credits:', error.message);
        return {
            success: false,
            error: 'An error occurred while deducting credits'
        };
    }
}

/**
 * Get user transaction history
 */
export async function getTransactionHistory(userId, limit = 50) {

    try {
        const result = await CreditService.getTransactionHistory(userId, limit);
        return result;
    } catch (error) {
        console.error('  Credits API: Error getting history:', error.message);
        return {
            transactions: [],
            status: 'error'
        };
    }
}

/**
 * Get usage summary
 */
export async function getUsageSummary(userId) {

    try {
        const result = await CreditService.getUsageSummary(userId);
        return result;
    } catch (error) {
        console.error('  Credits API: Error getting usage summary:', error.message);
        return null;
    }
}

export default {
    getUserBalance,
    checkSufficientCredits,
    deductExecutionCredits,
    getTransactionHistory,
    getUsageSummary
};
