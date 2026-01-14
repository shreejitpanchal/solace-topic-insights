import { Client } from '@elastic/elasticsearch';
import { config } from './config.js';

export class ElasticsearchClient {
  constructor() {
    this.client = null;
    this.indexName = config.elasticsearch.indexName;
  }

  async initialize() {
    // Create Elasticsearch client
    const clientConfig = {
      node: config.elasticsearch.node,
      auth: {
        username: config.elasticsearch.username,
        password: config.elasticsearch.password,
      },
      tls: config.elasticsearch.tls,
      maxRetries: config.elasticsearch.maxRetries,
      requestTimeout: config.elasticsearch.requestTimeoutMs,
    };

    // Remove auth if not configured
    if (!config.elasticsearch.username) {
      delete clientConfig.auth;
    }

    // Remove TLS if not configured
    if (!config.elasticsearch.tls.rejectUnauthorized) {
      delete clientConfig.tls;
    }

    this.client = new Client(clientConfig);

    // Verify connection
    await this.client.ping();
    console.log(`Connected to Elasticsearch at ${config.elasticsearch.node}`);

    // Create index with mapping if it doesn't exist
    await this.createIndexIfNotExists();
  }

  async createIndexIfNotExists() {
    const indexExists = await this.client.indices.exists({
      index: this.indexName,
    });

    if (!indexExists) {
      await this.client.indices.create({
        index: this.indexName,
        body: {
          settings: {
            number_of_shards: config.elasticsearch.indexSettings.numberOfShards,
            number_of_replicas: config.elasticsearch.indexSettings.numberOfReplicas,
            refresh_interval: config.elasticsearch.indexSettings.refreshInterval,
            // ILM policy for data lifecycle management
            'index.lifecycle.name': config.elasticsearch.ilmPolicy || undefined,
          },
          mappings: {
            properties: {
              topic: {
                type: 'keyword',
                // Also enable text search on topic
                fields: {
                  text: {
                    type: 'text',
                    analyzer: 'standard',
                  },
                },
              },
              '@timestamp': {
                type: 'date',
                format: 'strict_date_optional_time',
              },
              vpnName: {
                type: 'keyword',
              },
            },
          },
        },
      });
      console.log(`Created index: ${this.indexName}`);
    } else {
      console.log(`Index already exists: ${this.indexName}`);
    }
  }

  async bulkIndex(documents) {
    if (documents.length === 0) {
      return;
    }

    const operations = documents.flatMap((doc) => [
      { index: { _index: this.indexName } },
      doc,
    ]);

    const response = await this.client.bulk({
      refresh: false, // Don't refresh after each bulk - let refresh_interval handle it
      operations,
    });

    if (response.errors) {
      const erroredDocs = response.items.filter((item) => item.index?.error);
      console.error(`Bulk indexing errors: ${erroredDocs.length} failed`);
      erroredDocs.slice(0, 5).forEach((item) => {
        console.error('Error:', item.index.error);
      });
    }

    return response;
  }

  async close() {
    if (this.client) {
      await this.client.close();
      console.log('Elasticsearch client closed');
    }
  }
}
