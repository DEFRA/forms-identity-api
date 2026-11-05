declare module '@defra/cdp-metrics' {
  /**
   * Sends custom metrics to CloudWatch in the service's namespace
   */
  export class Metrics {
    /**
     * @param logger - receives a warning when a metric fails to send
     */
    constructor(logger?: { warn?: (...args: unknown[]) => void })

    /**
     * Sends a count metric
     * @param name - metric name
     * @param value - count to add (default 1)
     * @param dimensions - low-cardinality labels for the metric
     */
    counter(
      name: string,
      value?: number,
      dimensions?: Record<string, string>
    ): Promise<void>
  }
}
