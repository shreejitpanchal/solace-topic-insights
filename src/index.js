import solace from 'solclientjs';
import { ElasticsearchClient } from './elasticsearch-client.js';
import { config } from './config.js';

// Initialize Solace factory
const factoryProps = new solace.SolclientFactoryProperties();
factoryProps.profile = solace.SolclientFactoryProfiles.version10_5;
solace.SolclientFactory.init(factoryProps);

class SolaceTopicTracker {
  constructor() {
    this.session = null;
    this.esClient = new ElasticsearchClient();
    this.messageCount = 0;
    this.batchBuffer = [];
    this.batchSize = config.elasticsearch.batchSize;
    this.flushInterval = null;
  }

  async start() {
    try {
      // Initialize Elasticsearch
      await this.esClient.initialize();
      console.log('Elasticsearch client initialized');

      // Connect to Solace
      await this.connectToSolace();

      // Start periodic flush for remaining messages in buffer
      this.flushInterval = setInterval(() => this.flushBuffer(), config.elasticsearch.flushIntervalMs);

      // Handle graceful shutdown
      process.on('SIGINT', () => this.shutdown());
      process.on('SIGTERM', () => this.shutdown());

      console.log('Topic tracker started successfully');
    } catch (error) {
      console.error('Failed to start topic tracker:', error.message);
      process.exit(1);
    }
  }

  connectToSolace() {
    return new Promise((resolve, reject) => {
      const sessionProperties = {
        url: config.solace.url,
        vpnName: config.solace.vpnName,
        userName: config.solace.userName,
        password: config.solace.password,
        connectRetries: config.solace.connectRetries,
        reconnectRetries: config.solace.reconnectRetries,
        reconnectRetryWaitInMsecs: config.solace.reconnectRetryWaitMs,
        keepAliveIntervalInMsecs: config.solace.keepAliveIntervalMs,
        keepAliveIntervalsLimit: config.solace.keepAliveIntervalsLimit,
        reapplySubscriptions: true,
      };

      this.session = solace.SolclientFactory.createSession(sessionProperties);

      // Session event handlers
      this.session.on(solace.SessionEventCode.UP_NOTICE, (sessionEvent) => {
        console.log(`Connected to Solace broker: ${config.solace.url}`);
        console.log(`VPN: ${config.solace.vpnName}`);
        this.subscribeToAllTopics();
        resolve();
      });

      this.session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (sessionEvent) => {
        console.error('Connection failed:', sessionEvent.infoStr);
        reject(new Error(sessionEvent.infoStr));
      });

      this.session.on(solace.SessionEventCode.DISCONNECTED, (sessionEvent) => {
        console.log('Disconnected from Solace broker');
        if (sessionEvent.infoStr) {
          console.log('Reason:', sessionEvent.infoStr);
        }
      });

      this.session.on(solace.SessionEventCode.RECONNECTING_NOTICE, () => {
        console.log('Reconnecting to Solace broker...');
      });

      this.session.on(solace.SessionEventCode.RECONNECTED_NOTICE, () => {
        console.log('Reconnected to Solace broker');
      });

      this.session.on(solace.SessionEventCode.SUBSCRIPTION_ERROR, (sessionEvent) => {
        console.error('Subscription error:', sessionEvent.infoStr);
      });

      this.session.on(solace.SessionEventCode.SUBSCRIPTION_OK, (sessionEvent) => {
        console.log('Subscription confirmed');
      });

      // Message handler - capture topic destination only
      this.session.on(solace.SessionEventCode.MESSAGE, (message) => {
        this.handleMessage(message);
      });

      // Connect to Solace
      console.log(`Connecting to Solace broker at ${config.solace.url}...`);
      this.session.connect();
    });
  }

  subscribeToAllTopics() {
    // Subscribe to all topics using wildcard '>'
    // This captures all messages on all topic levels
    const topicSubscriptions = config.solace.topicSubscriptions;

    topicSubscriptions.forEach((topicPattern) => {
      try {
        const topic = solace.SolclientFactory.createTopicDestination(topicPattern);
        this.session.subscribe(
          topic,
          true, // requestConfirmation
          topicPattern, // correlationKey
          config.solace.subscribeTimeoutMs
        );
        console.log(`Subscribed to topic pattern: ${topicPattern}`);
      } catch (error) {
        console.error(`Failed to subscribe to ${topicPattern}:`, error.message);
      }
    });
  }

  handleMessage(message) {
    try {
      // Extract only the topic destination - ignore payload and headers
      const destination = message.getDestination();
      const topicName = destination ? destination.getName() : 'unknown';

      // Create the document with only required fields
      // Using @timestamp for Grafana/Elasticsearch compatibility
      const doc = {
        topic: topicName,
        '@timestamp': new Date().toISOString(),
        vpnName: config.solace.vpnName,
      };

      // Add to batch buffer
      this.batchBuffer.push(doc);
      this.messageCount++;

      // Log progress periodically
      if (this.messageCount % 1000 === 0) {
        console.log(`Processed ${this.messageCount} messages`);
      }

      // Flush buffer if batch size reached
      if (this.batchBuffer.length >= this.batchSize) {
        this.flushBuffer();
      }
    } catch (error) {
      console.error('Error handling message:', error.message);
    }
  }

  async flushBuffer() {
    if (this.batchBuffer.length === 0) {
      return;
    }

    const docsToFlush = [...this.batchBuffer];
    this.batchBuffer = [];

    try {
      await this.esClient.bulkIndex(docsToFlush);
      console.log(`Flushed ${docsToFlush.length} documents to Elasticsearch`);
    } catch (error) {
      console.error('Error flushing to Elasticsearch:', error.message);
      // Re-add failed documents to buffer for retry
      this.batchBuffer = [...docsToFlush, ...this.batchBuffer];
    }
  }

  async shutdown() {
    console.log('\nShutting down...');

    // Clear flush interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    // Flush remaining messages
    await this.flushBuffer();

    // Disconnect from Solace
    if (this.session) {
      try {
        this.session.disconnect();
        console.log('Disconnected from Solace broker');
      } catch (error) {
        console.error('Error disconnecting:', error.message);
      }
    }

    // Close Elasticsearch client
    await this.esClient.close();

    console.log(`Total messages processed: ${this.messageCount}`);
    process.exit(0);
  }
}

// Start the tracker
const tracker = new SolaceTopicTracker();
tracker.start();
