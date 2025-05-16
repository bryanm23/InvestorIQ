Set up Loki (Log Aggregation Server)

Install Loki on your Grafana server:
# Remove the existing binary
sudo rm /usr/local/bin/loki

# Download the ARM64 (aarch64) version
wget https://github.com/grafana/loki/releases/download/v2.9.2/loki-linux-arm64.zip

# Unzip and install
```bash
unzip loki-linux-arm64.zip
sudo mv loki-linux-arm64 /usr/local/bin/loki
sudo chmod +x /usr/local/bin/loki

sudo mkdir -p /var/lib/loki/chunks /var/lib/loki/boltdb-shipper-active /var/lib/loki/boltdb-shipper-cache
sudo chown -R grafana:grafana /var/lib/loki
```
Create a basic Loki configuration file at /etc/loki/loki.yaml:
```bash
auth_enabled: false

server:
  http_listen_port: 3100

ingester:
  lifecycler:
    address: 127.0.0.1
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1
    final_sleep: 0s
  chunk_idle_period: 5m
  chunk_retain_period: 30s
  wal:
    enabled: true
    dir: /var/lib/loki/wal

schema_config:
  configs:
    - from: 2020-01-01
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h

storage_config:
  boltdb_shipper:
    active_index_directory: /var/lib/loki/boltdb-shipper-active
    cache_location: /var/lib/loki/boltdb-shipper-cache
    cache_ttl: 24h
    shared_store: filesystem
  filesystem:
    directory: /var/lib/loki/chunks

limits_config:
  enforce_metric_name: false
  reject_old_samples: true
  reject_old_samples_max_age: 168h
  max_entries_limit_per_query: 5000

compactor:
  working_directory: /var/lib/loki/boltdb-shipper-compactor
```
### Create a systemd service for Loki at /etc/systemd/system/loki.service:
```bash
[Unit]
Description=Loki service
After=network.target

[Service]
Type=simple
User=grafana
ExecStart=/usr/local/bin/loki -config.file=/etc/loki/loki.yaml
Restart=always

[Install]
WantedBy=multi-user.target
```

### Start and enable the Loki service:
sudo systemctl daemon-reload
sudo mkdir -p /var/lib/loki/wal
sudo chown -R grafana:grafana /var/lib/loki
sudo chmod -R 755 /var/lib/loki

sudo systemctl restart loki