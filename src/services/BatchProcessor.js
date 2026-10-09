import { psAPI } from "./PhotoshopAPI";

/**
 * BatchProcessor Service
 * Handles batch processing of PSD files with Excel data
 * Applies mapping and deducts credits
 */

class BatchProcessorService {
    constructor() {
        this.currentBatch = null;
        this.processedCount = 0;
        this.totalCount = 0;
        this.errors = [];
        this.results = [];
    }

    /**
     * Initialize batch processing
     */
    async initializeBatch(excelData, psdFile, mapping, accountId) {
        try {
            console.log("[BatchProcessor] Initializing batch");

            this.currentBatch = {
                id: `batch_${Date.now()}`,
                accountId,
                psdFile,
                excelData,
                mapping,
                startTime: new Date(),
                status: "initializing",
                processedCount: 0,
                totalCount: excelData.rows.length,
                errors: [],
                results: []
            };

            this.processedCount = 0;
            this.totalCount = excelData.rows.length;
            this.errors = [];
            this.results = [];

            // Calculate credit cost
            const creditCost = this.calculateCreditCost(excelData.rows.length);

            return {
                success: true,
                batchId: this.currentBatch.id,
                totalItems: this.totalCount,
                estimatedCredits: creditCost
            };
        } catch (error) {
            console.error("[BatchProcessor] Initialization failed:", error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Process a single row of data
     */
    async processRow(rowData, rowIndex, onProgress) {
        try {
            console.log(`[BatchProcessor] Processing row ${rowIndex + 1}/${this.totalCount}`);

            const result = {
                rowIndex,
                rowData,
                status: "processing",
                changes: [],
                errors: []
            };

            // Apply each mapping rule
            for (const mapping of this.currentBatch.mapping) {
                try {
                    const value = rowData[mapping.columnName];

                    if (value === null || value === undefined) {
                        result.errors.push({
                            field: mapping.layerName,
                            error: "Value not found in Excel"
                        });
                        continue;
                    }

                    // Apply the mapping based on operation type
                    switch (mapping.operationType) {
                        case "text":
                            await this.applyTextMapping(mapping, value);
                            result.changes.push({
                                layer: mapping.layerName,
                                operation: "text",
                                value: value
                            });
                            break;

                        case "image":
                            // Image replacement would require additional file handling
                            result.changes.push({
                                layer: mapping.layerName,
                                operation: "image",
                                value: value,
                                status: "pending"
                            });
                            break;

                        case "visibility":
                            await this.applyVisibilityMapping(mapping, value);
                            result.changes.push({
                                layer: mapping.layerName,
                                operation: "visibility",
                                value: value
                            });
                            break;

                        case "opacity":
                            await this.applyOpacityMapping(mapping, value);
                            result.changes.push({
                                layer: mapping.layerName,
                                operation: "opacity",
                                value: value
                            });
                            break;

                        default:
                            result.errors.push({
                                field: mapping.layerName,
                                error: `Unknown operation type: ${mapping.operationType}`
                            });
                    }
                } catch (error) {
                    result.errors.push({
                        field: mapping.layerName,
                        error: error.message
                    });
                }
            }

            result.status = result.errors.length === 0 ? "success" : "partial";
            this.processedCount++;
            this.results.push(result);

            // Report progress
            if (onProgress) {
                onProgress({
                    processed: this.processedCount,
                    total: this.totalCount,
                    percentage: Math.round((this.processedCount / this.totalCount) * 100),
                    currentRow: rowIndex + 1,
                    status: result.status
                });
            }

            return result;
        } catch (error) {
            console.error("[BatchProcessor] Row processing failed:", error);
            this.errors.push({
                rowIndex,
                error: error.message
            });

            if (onProgress) {
                onProgress({
                    processed: this.processedCount + 1,
                    total: this.totalCount,
                    percentage: Math.round(((this.processedCount + 1) / this.totalCount) * 100),
                    currentRow: rowIndex + 1,
                    status: "error"
                });
            }

            return {
                rowIndex,
                status: "error",
                error: error.message
            };
        }
    }

    /**
     * Apply text mapping to a layer
     */
    async applyTextMapping(mapping, value) {
        try {
            const formattedValue = await this.formatValue(value, mapping.format);
            await psAPI.updateTextLayer(mapping.layerName, formattedValue);
            return true;
        } catch (error) {
            console.error("[BatchProcessor] Text mapping failed:", error);
            throw error;
        }
    }

    /**
     * Apply visibility mapping to a layer
     */
    async applyVisibilityMapping(mapping, value) {
        try {
            const visible = this.parseBoolean(value);
            await psAPI.setLayerVisibility(mapping.layerName, visible);
            return true;
        } catch (error) {
            console.error("[BatchProcessor] Visibility mapping failed:", error);
            throw error;
        }
    }

    /**
     * Apply opacity mapping to a layer
     */
    async applyOpacityMapping(mapping, value) {
        try {
            const opacity = Math.max(0, Math.min(100, parseInt(value, 10)));
            await psAPI.setLayerOpacity(mapping.layerName, opacity);
            return true;
        } catch (error) {
            console.error("[BatchProcessor] Opacity mapping failed:", error);
            throw error;
        }
    }

    /**
     * Format value based on format rules
     */
    async formatValue(value, format) {
        try {
            if (!format) return String(value);

            switch (format.type) {
                case "uppercase":
                    return String(value).toUpperCase();
                case "lowercase":
                    return String(value).toLowerCase();
                case "capitalize":
                    return String(value).charAt(0).toUpperCase() + String(value).slice(1);
                case "currency":
                    const num = parseFloat(value);
                    return format.prefix + num.toFixed(format.decimals) + format.suffix;
                case "date":
                    return new Date(value).toLocaleDateString(format.locale || "en-US");
                case "number":
                    const number = parseFloat(value);
                    return number.toFixed(format.decimals || 0);
                case "custom":
                    // Use the custom template
                    return format.template.replace("{value}", value);
                default:
                    return String(value);
            }
        } catch (error) {
            console.error("[BatchProcessor] Format failed:", error);
            return String(value);
        }
    }

    /**
     * Parse boolean value
     */
    parseBoolean(value) {
        const str = String(value).toLowerCase().trim();
        return ["true", "yes", "1", "on", "enabled"].includes(str);
    }

    /**
     * Process entire batch
     */
    async processBatch(onProgress) {
        try {
            if (!this.currentBatch) {
                throw new Error("No batch initialized");
            }

            console.log("[BatchProcessor] Starting batch processing");
            this.currentBatch.status = "processing";

            for (let i = 0; i < this.currentBatch.excelData.rows.length; i++) {
                const row = this.currentBatch.excelData.rows[i];
                await this.processRow(row, i, onProgress);

                // Add a small delay to prevent system overload
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            return this.completeBatch();
        } catch (error) {
            console.error("[BatchProcessor] Batch processing failed:", error);
            return this.failBatch(error);
        }
    }

    /**
     * Complete batch processing
     */
    completeBatch() {
        try {
            this.currentBatch.status = "completed";
            this.currentBatch.endTime = new Date();
            this.currentBatch.duration = this.currentBatch.endTime - this.currentBatch.startTime;
            this.currentBatch.results = this.results;
            this.currentBatch.errors = this.errors;

            const summary = {
                success: true,
                batchId: this.currentBatch.id,
                status: "completed",
                processedCount: this.processedCount,
                totalCount: this.totalCount,
                successCount: this.results.filter(r => r.status === "success").length,
                partialCount: this.results.filter(r => r.status === "partial").length,
                errorCount: this.results.filter(r => r.status === "error").length,
                duration: this.currentBatch.duration,
                creditCost: this.calculateCreditCost(this.totalCount),
                results: this.results
            };

            console.log("[BatchProcessor] Batch completed:", summary);
            return summary;
        } catch (error) {
            console.error("[BatchProcessor] Completion failed:", error);
            return this.failBatch(error);
        }
    }

    /**
     * Fail batch processing
     */
    failBatch(error) {
        this.currentBatch.status = "failed";
        this.currentBatch.error = error.message;

        return {
            success: false,
            batchId: this.currentBatch.id,
            status: "failed",
            error: error.message,
            processedCount: this.processedCount
        };
    }

    /**
     * Calculate credit cost for batch
     */
    calculateCreditCost(rowCount) {
        // Base cost: 1 credit per row
        // Bonus: Batch processing discount (10% off for 10+ rows, 20% off for 50+)
        let cost = rowCount * 1;

        if (rowCount >= 50) {
            cost = cost * 0.8;
        } else if (rowCount >= 10) {
            cost = cost * 0.9;
        }

        return Math.ceil(cost);
    }

    /**
     * Get batch status
     */
    getBatchStatus() {
        if (!this.currentBatch) return null;

        return {
            batchId: this.currentBatch.id,
            status: this.currentBatch.status,
            progress: {
                processed: this.processedCount,
                total: this.totalCount,
                percentage: Math.round((this.processedCount / this.totalCount) * 100)
            },
            errorCount: this.errors.length,
            resultCount: this.results.length
        };
    }

    /**
     * Cancel batch processing
     */
    cancelBatch() {
        if (this.currentBatch) {
            this.currentBatch.status = "cancelled";
            console.log("[BatchProcessor] Batch cancelled");
            return true;
        }
        return false;
    }

    /**
     * Get batch results
     */
    getBatchResults() {
        if (!this.currentBatch) return null;

        return {
            batchId: this.currentBatch.id,
            status: this.currentBatch.status,
            summary: {
                total: this.totalCount,
                successful: this.results.filter(r => r.status === "success").length,
                partial: this.results.filter(r => r.status === "partial").length,
                failed: this.results.filter(r => r.status === "error").length
            },
            results: this.results,
            errors: this.errors
        };
    }

    /**
     * Export batch results as CSV
     */
    exportResults() {
        try {
            const csv = [
                ["Row", "Status", "Changes", "Errors"].join(","),
                ...this.results.map((r, i) => [
                    i + 1,
                    r.status,
                    JSON.stringify(r.changes),
                    r.errors.length > 0 ? JSON.stringify(r.errors) : ""
                ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
            ].join("\n");

            return csv;
        } catch (error) {
            console.error("[BatchProcessor] Export failed:", error);
            throw error;
        }
    }
}

export const batchProcessor = new BatchProcessorService();
export default BatchProcessorService;
