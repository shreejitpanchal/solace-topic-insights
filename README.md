# Solace Topic Insights

A Node.js application that connects to a Solace broker via WebSocket, captures topic destinations from all direct messages, and stores them in Elasticsearch as time-series data.

## Features

- Connects to Solace broker using WebSocket protocol
- Subscribes to all topics using wildcard subscription (`>`)
- Captures only topic destination (ignores payload and headers)
- Stores topic, timestamp, and VPN name in Elasticsearch
- Batch processing for efficient Elasticsearch writes
- Automatic reconnection handling
- Graceful shutdown with buffer flush

## Architecture

### High-Level Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              SOLACE BROKER                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                         VPN: "YOUR_VPN_NAME"                            │ │
│  │                                                                         │ │
│  │   Publishers                          Topics                            │ │
│  │   ──────────                          ──────                            │ │
│  │   ┌─────────┐                    orders/us/created                      │ │
│  │   │ App A   │────────────────►   orders/eu/created                      │ │
│  │   └─────────┘                    payments/processed                     │ │
│  │   ┌─────────┐                    users/signup                           │ │
│  │   │ App B   │────────────────►   inventory/update                       │ │
│  │   └─────────┘                    notifications/email                    │ │
│  │   ┌─────────┐                           │                               │ │
│  │   │ App C   │────────────────►          │                               │ │
│  │   └─────────┘                           │                               │ │
│  │                                         │                               │ │
│  │                          Wildcard Sub: ">"                              │ │
│  │                          (All Topics)   │                               │ │
│  └─────────────────────────────────────────┼───────────────────────────────┘ │
└────────────────────────────────────────────┼─────────────────────────────────┘
                                             │
                                             │ WebSocket (ws://broker:8008)
                                             │ Direct Messages
                                             ▼
                    ┌─────────────────────────────────────────────┐
                    │          SOLACE TOPIC INSIGHTS              │
                    │              (Node.js)                      │
                    │                                             │
                    │  ┌───────────────────────────────────────┐  │
                    │  │         Message Handler               │  │
                    │  │                                       │  │
                    │  │  • Extract topic destination only     │  │
                    │  │  • Ignore payload (memory efficient)  │  │
                    │  │  • Ignore headers                     │  │
                    │  │  • Add @timestamp                     │  │
                    │  │  • Add VPN name                       │  │
                    │  └───────────────────────────────────────┘  │
                    │                    │                        │
                    │                    ▼                        │
                    │  ┌───────────────────────────────────────┐  │
                    │  │         Batch Buffer                  │  │
                    │  │                                       │  │
                    │  │  [doc1, doc2, doc3, ... docN]         │  │
                    │  │                                       │  │
                    │  │  Flush when:                          │  │
                    │  │  • Buffer size >= 100 (configurable)  │  │
                    │  │  • Every 5 seconds (configurable)     │  │
                    │  └───────────────────────────────────────┘  │
                    │                    │                        │
                    └────────────────────┼────────────────────────┘
                                         │
                                         │ Bulk Index API
                                         │ (HTTP/HTTPS)
                                         ▼
                    ┌─────────────────────────────────────────────┐
                    │              ELASTICSEARCH                  │
                    │                                             │
                    │  Index: "metrics_index"                     │
                    │                                             │
                    │  ┌───────────────────────────────────────┐  │
                    │  │  Document Structure                   │  │
                    │  │                                       │  │
                    │  │  {                                    │  │
                    │  │    "topic": "orders/us/created",      │  │
                    │  │    "@timestamp": "2025-01-14T10:...",  │  │
                    │  │    "vpnName": "YOUR_VPN_NAME"         │  │
                    │  │  }                                    │  │
                    │  └───────────────────────────────────────┘  │
                    │                                             │
                    └─────────────────────────────────────────────┘
                                         │
                                         │ Query
                                         ▼
                    ┌─────────────────────────────────────────────┐
                    │                GRAFANA                      │
                    │                                             │
                    │  • Topic distribution pie charts            │
                    │  • Message count over time                  │
                    │  • Unique topics count                      │
                    │  • VPN-based filtering                      │
                    └─────────────────────────────────────────────┘
```

### Data Flow

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Solace    │      │   Tracker   │      │   Elastic   │      │   Grafana   │
│   Broker    │      │   App       │      │   Search    │      │             │
└──────┬──────┘      └──────┬──────┘      └──────┬──────┘      └──────┬──────┘
       │                    │                    │                    │
       │  1. Subscribe ">"  │                    │                    │
       │◄───────────────────│                    │                    │
       │                    │                    │                    │
       │  2. Direct Message │                    │                    │
       │   (any topic)      │                    │                    │
       │───────────────────►│                    │                    │
       │                    │                    │                    │
       │                    │  3. Extract topic  │                    │
       │                    │     destination    │                    │
       │                    │     only           │                    │
       │                    │                    │                    │
       │                    │  4. Bulk index     │                    │
       │                    │───────────────────►│                    │
       │                    │                    │                    │
       │                    │                    │  5. Query metrics  │
       │                    │                    │◄───────────────────│
       │                    │                    │                    │
       │                    │                    │  6. Visualize      │
       │                    │                    │───────────────────►│
       │                    │                    │                    │
```

### Solace Wildcard Subscription

```
Topic Hierarchy Example:
────────────────────────

    orders
    ├── us
    │   ├── created     →  orders/us/created
    │   └── cancelled   →  orders/us/cancelled
    ├── eu
    │   ├── created     →  orders/eu/created
    │   └── cancelled   →  orders/eu/cancelled
    └── asia
        └── created     →  orders/asia/created

Wildcard Patterns:
──────────────────

  ">"           →  Matches ALL topics at ALL levels (used by this app)
  "orders/>"    →  Matches all topics under "orders/"
  "orders/*"    →  Matches one level under "orders/" (e.g., orders/us, orders/eu)
  "orders/*/created"  →  Matches orders/us/created, orders/eu/created, etc.
```

## Elasticsearch Index Schema

### Index Mapping

| Field | Type | Description |
|-------|------|-------------|
| `topic` | keyword | The topic destination name (also indexed as text for search) |
| `@timestamp` | date | When the message was received (ISO 8601 format) |
| `vpnName` | keyword | Solace VPN name |

### Sample Document

```json
{
  "topic": "orders/us-east/created",
  "@timestamp": "2025-01-14T10:30:45.123Z",
  "vpnName": "production"
}
```

### Index Settings

```json
{
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 0,
    "refresh_interval": "5s"
  },
  "mappings": {
    "properties": {
      "topic": {
        "type": "keyword",
        "fields": {
          "text": {
            "type": "text",
            "analyzer": "standard"
          }
        }
      },
      "@timestamp": {
        "type": "date",
        "format": "strict_date_optional_time"
      },
      "vpnName": {
        "type": "keyword"
      }
    }
  }
}
```

## Prerequisites

- Node.js 18.0.0 or higher
- Solace PubSub+ broker with WebSocket enabled
- Elasticsearch 8.x
- Grafana (optional, for visualization)

## Installation

```bash
npm install
```

## Configuration

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Edit `.env` with your settings:

```env
# Solace Broker Configuration
SOLACE_URL=ws://your-solace-broker:8008
SOLACE_VPN_NAME=your-vpn-name
SOLACE_USERNAME=your-username
SOLACE_PASSWORD=your-password

# Topic subscriptions (comma-separated)
# '>' captures all topics
SOLACE_TOPIC_SUBSCRIPTIONS=>

# Elasticsearch Configuration
ELASTICSEARCH_NODE=http://your-elasticsearch:9200
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=your-password
ELASTICSEARCH_INDEX_NAME=metrics_index
```

## Usage

### Start the application

```bash
npm start
```

### Development mode (auto-reload)

```bash
npm run dev
```

## Querying Data

### Get topic distribution (last 24 hours)

```json
GET metrics_index/_search
{
  "size": 0,
  "query": {
    "range": {
      "@timestamp": {
        "gte": "now-24h"
      }
    }
  },
  "aggs": {
    "topics": {
      "terms": {
        "field": "topic",
        "size": 100
      }
    }
  }
}
```

### Get message count over time

```json
GET metrics_index/_search
{
  "size": 0,
  "aggs": {
    "messages_over_time": {
      "date_histogram": {
        "field": "@timestamp",
        "fixed_interval": "1m"
      }
    }
  }
}
```

### Get topics by VPN

```json
GET metrics_index/_search
{
  "size": 0,
  "aggs": {
    "by_vpn": {
      "terms": {
        "field": "vpnName"
      },
      "aggs": {
        "topics": {
          "terms": {
            "field": "topic",
            "size": 50
          }
        }
      }
    }
  }
}
```

## Memory Footprint

| Scenario | Estimated Memory |
|----------|------------------|
| Idle (connected, no messages) | ~60-80 MB |
| Low traffic (10 msg/sec) | ~60-85 MB |
| Medium traffic (100 msg/sec) | ~70-100 MB |
| High traffic (1000 msg/sec) | ~80-150 MB |

## Performance Tuning

### Batch Size
Adjust `ELASTICSEARCH_BATCH_SIZE` based on your message volume:
- Low volume (<100 msg/sec): 50-100
- Medium volume (100-1000 msg/sec): 100-500
- High volume (>1000 msg/sec): 500-1000

### Flush Interval
Adjust `ELASTICSEARCH_FLUSH_INTERVAL_MS` for data freshness vs. efficiency:
- Real-time needs: 1000-2000ms
- Normal operation: 5000ms
- High throughput: 10000ms

## Grafana Dashboard

Import the included `grafana-dashboard.json` for pre-built visualizations:
- Topic distribution pie chart
- Messages over time (stacked bar chart)
- Topic count table
- Total messages stat
- Unique topics count
- Messages by VPN

## License

MIT
