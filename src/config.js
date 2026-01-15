import 'dotenv/config';

export const config = {
  solace: {
    // WebSocket URL format: ws://host:port or wss://host:port
    url: process.env.SOLACE_URL || 'ws://localhost:8008',
    vpnName: process.env.SOLACE_VPN_NAME || 'default',
    userName: process.env.SOLACE_USERNAME || 'admin',
    password: process.env.SOLACE_PASSWORD || 'admin',

    // Topic subscriptions - '>' is wildcard for all topics at all levels
    // You can add specific patterns like 'app/>' or 'orders/*'
    topicSubscriptions: process.env.SOLACE_TOPIC_SUBSCRIPTIONS
      ? process.env.SOLACE_TOPIC_SUBSCRIPTIONS.split(',')
      : ['>'],

    // Connection settings
    connectRetries: parseInt(process.env.SOLACE_CONNECT_RETRIES || '3', 10),
    reconnectRetries: parseInt(process.env.SOLACE_RECONNECT_RETRIES || '-1', 10), // -1 = infinite
    reconnectRetryWaitMs: parseInt(process.env.SOLACE_RECONNECT_WAIT_MS || '3000', 10),
    keepAliveIntervalMs: parseInt(process.env.SOLACE_KEEPALIVE_INTERVAL_MS || '3000', 10),
    keepAliveIntervalsLimit: parseInt(process.env.SOLACE_KEEPALIVE_LIMIT || '10', 10),
    subscribeTimeoutMs: parseInt(process.env.SOLACE_SUBSCRIBE_TIMEOUT_MS || '10000', 10),

    // SSL/TLS settings for WSS connections
    sslValidateCertificate: process.env.SOLACE_SSL_VALIDATE_CERTIFICATE !== 'false',
  },

  elasticsearch: {
    node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    username: process.env.ELASTICSEARCH_USERNAME || '',
    password: process.env.ELASTICSEARCH_PASSWORD || '',

    // Index configuration
    indexName: process.env.ELASTICSEARCH_INDEX_NAME || 'solace-topic-metrics',

    // TLS settings
    tls: {
      rejectUnauthorized: process.env.ELASTICSEARCH_TLS_VERIFY === 'true',
    },

    // Batching settings for efficient writes
    batchSize: parseInt(process.env.ELASTICSEARCH_BATCH_SIZE || '100', 10),
    flushIntervalMs: parseInt(process.env.ELASTICSEARCH_FLUSH_INTERVAL_MS || '5000', 10),

    // Client settings
    maxRetries: parseInt(process.env.ELASTICSEARCH_MAX_RETRIES || '3', 10),
    requestTimeoutMs: parseInt(process.env.ELASTICSEARCH_REQUEST_TIMEOUT_MS || '30000', 10),

    // Index settings
    indexSettings: {
      numberOfShards: parseInt(process.env.ELASTICSEARCH_SHARDS || '1', 10),
      numberOfReplicas: parseInt(process.env.ELASTICSEARCH_REPLICAS || '0', 10),
      refreshInterval: process.env.ELASTICSEARCH_REFRESH_INTERVAL || '5s',
    },

    // Optional ILM policy name for data lifecycle management
    ilmPolicy: process.env.ELASTICSEARCH_ILM_POLICY || null,
  },
};
