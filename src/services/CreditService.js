// Credit Service
// Handles credit checking, deduction, and transaction logging

import { SupabaseClient } from './SupabaseClient';

export class CreditService {
    /**
     * Check if user has enough credits
     */
    static async hasEnoughCredits(userId, creditsNeeded = 1) {

        try {
            const user = await SupabaseClient.getUserById(userId);

            if (!user) {
                console.error('  CreditService: User not found:', userId);
                return {
                    hasCredits: false,
                    currentCredits: 0,
                    creditsNeeded
                };
            }

            const hasCredits = user.credits >= creditsNeeded;

            return {
                hasCredits,
                currentCredits: user.credits,
                creditsNeeded
            };
        } catch (error) {
            console.error('  CreditService: Error checking credits:', error.message);
            return {
                hasCredits: false,
                currentCredits: 0,
                creditsNeeded
            };
        }
    }

    /**
     * Deduct credits from user
     */
    static async deductCredits(
        userId,
        creditsToDeduct = 1,
        executionDetails = {}
    ) {

        try {
            // Get current user
            const user = await SupabaseClient.getUserById(userId);

            if (!user) {
                console.error('  CreditService: User not found');
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            const creditsBefore = user.credits;

            // Check if enough credits
            if (creditsBefore < creditsToDeduct) {
                console.error('  CreditService: Insufficient credits');
                return {
                    success: false,
                    error: `Insufficient credits. Need ${creditsToDeduct}, have ${creditsBefore}`
                };
            }

            // Calculate new balance
            const creditsAfter = creditsBefore - creditsToDeduct;

            // Update user credits
            const updatedUser = await SupabaseClient.updateUserCredits(userId, creditsAfter);

            if (!updatedUser) {
                console.error('  CreditService: Failed to update credits');
                return {
                    success: false,
                    error: 'Failed to update credits'
                };
            }


            // Log transaction
            const transaction = await SupabaseClient.insertTransaction({
                user_id: userId,
                credits_used: creditsToDeduct,
                credits_before: creditsBefore,
                credits_after: creditsAfter,
                action: executionDetails.action || 'batch_processing',
                psd_file: executionDetails.psdFile || null,
                rows_processed: executionDetails.rowsProcessed || 0,
                success_count: executionDetails.successCount || 0,
                error_count: executionDetails.errorCount || 0,
                status: executionDetails.status || 'success'
            });


            return {
                success: true,
                creditsBefore,
                creditsAfter,
                transaction
            };
        } catch (error) {
            console.error('  CreditService: Deduct credits error:', error.message);
            return {
                success: false,
                error: 'An error occurred while deducting credits'
            };
        }
    }

    /**
     * Get user balance
     */
    static async getBalance(userId) {

        try {
            const user = await SupabaseClient.getUserById(userId);

            if (!user) {
                console.error('  CreditService: User not found');
                return {
                    credits: 0,
                    status: 'error'
                };
            }

            return {
                credits: user.credits,
                status: 'success'
            };
        } catch (error) {
            console.error('  CreditService: Error getting balance:', error.message);
            return {
                credits: 0,
                status: 'error'
            };
        }
    }

    /**
     * Get transaction history
     */
    static async getTransactionHistory(userId, limit = 50) {

        try {
            const transactions = await SupabaseClient.getTransactions(userId, limit);

            return {
                transactions,
                status: 'success'
            };
        } catch (error) {
            console.error('  CreditService: Error getting history:', error.message);
            return {
                transactions: [],
                status: 'error'
            };
        }
    }

    /**
     * Get credit usage summary
     */
    static async getUsageSummary(userId) {

        try {
            const user = await SupabaseClient.getUserById(userId);
            const transactions = await SupabaseClient.getTransactions(userId, 100);

            if (!user) {
                console.error('  CreditService: User not found');
                return null;
            }

            // Calculate stats
            const totalUsed = transactions.reduce((sum, t) => sum + t.credits_used, 0);
            const successfulExecutions = transactions.filter(t => t.status === 'success').length;
            const totalRows = transactions.reduce((sum, t) => sum + (t.rows_processed || 0), 0);
            const totalSuccessfulRows = transactions.reduce((sum, t) => sum + (t.success_count || 0), 0);


            return {
                currentCredits: user.credits,
                totalUsed,
                successfulExecutions,
                totalRows,
                totalSuccessfulRows
            };
        } catch (error) {
            console.error('  CreditService: Error getting usage summary:', error.message);
            return null;
        }
    }
}

export default CreditService;
