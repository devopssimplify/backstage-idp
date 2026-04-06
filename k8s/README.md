# Backstage Deployment to GKE

This directory contains Kubernetes manifests to deploy Backstage to Google Kubernetes Engine (GKE).

## Prerequisites

1. **GCP Project**: `project-7d27fad9-61bb-42c4-b2e`
2. **GKE Cluster**: A running GKE cluster
3. **Tools Installed**:
   - `gcloud` CLI
   - `kubectl`
   - `docker`
4. **GitHub Personal Access Token** with repo permissions

## Deployment Steps

### Step 1: Authenticate with GCP

```bash
# Authenticate with your GCP account
gcloud auth login

# Set the project
gcloud config set project project-7d27fad9-61bb-42c4-b2e

# Get credentials for your GKE cluster
gcloud container clusters get-credentials YOUR_CLUSTER_NAME --region YOUR_REGION
```

### Step 2: Build and Push Docker Image

```bash
cd C:\Tapas\POC\Platform\IDP\backstage

# Make the script executable (on Linux/Mac) or run with bash on Windows
bash build-and-push.sh v1.0.0

# This will:
# 1. Authenticate Docker with GCR
# 2. Build the Docker image
# 3. Push to gcr.io/project-7d27fad9-61bb-42c4-b2e/backstage:v1.0.0
# 4. Tag as :latest
```

### Step 3: Configure Secrets

Edit `k8s/01-secrets.yaml` and replace the base64 encoded values:

```bash
# Encode your GitHub token
echo -n "ghp_your_actual_token_here" | base64

# Encode PostgreSQL password (choose a secure password)
echo -n "your-secure-postgres-password" | base64

# Update the secrets file with these values
```

**Required secrets:**
- `GITHUB_TOKEN`: Your GitHub Personal Access Token
- `POSTGRES_PASSWORD`: Strong password for PostgreSQL
- `POSTGRES_USER`: Username (default: backstage - already encoded)
- `POSTGRES_HOST`: Database host (default: postgresql.idp.svc.cluster.local - already encoded)
- `POSTGRES_PORT`: Database port (default: 5432 - already encoded)

### Step 4: Deploy to GKE

```bash
# Apply all manifests in order
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-secrets.yaml
kubectl apply -f k8s/02-postgresql.yaml

# Wait for PostgreSQL to be ready
kubectl wait --for=condition=ready pod -l app=postgresql -n idp --timeout=120s

# Deploy Backstage
kubectl apply -f k8s/03-backstage-deployment.yaml
kubectl apply -f k8s/04-backstage-service.yaml
```

### Step 5: Get LoadBalancer IP

```bash
# Wait for LoadBalancer to get an external IP (may take 2-3 minutes)
kubectl get svc backstage -n idp --watch

# Once EXTERNAL-IP is assigned (not <pending>), note it down
kubectl get svc backstage -n idp
```

Example output:
```
NAME        TYPE           CLUSTER-IP    EXTERNAL-IP      PORT(S)        AGE
backstage   LoadBalancer   10.XX.XX.XX   35.XXX.XXX.XXX   80:XXXXX/TCP   5m
```

### Step 6: Update Backstage Deployment with LoadBalancer IP

Edit `k8s/03-backstage-deployment.yaml` and update the `BACKSTAGE_BASE_URL`:

```yaml
- name: BACKSTAGE_BASE_URL
  value: "http://35.XXX.XXX.XXX"  # Replace with your actual EXTERNAL-IP
```

Apply the updated deployment:

```bash
kubectl apply -f k8s/03-backstage-deployment.yaml

# Restart the pods to pick up the new configuration
kubectl rollout restart deployment/backstage -n idp
```

### Step 7: Access Backstage

Open your browser and navigate to:
```
http://YOUR_LOAD_BALANCER_IP
```

## Verification

```bash
# Check all resources in idp namespace
kubectl get all -n idp

# Check Backstage logs
kubectl logs -f deployment/backstage -n idp

# Check PostgreSQL logs
kubectl logs -f deployment/postgresql -n idp

# Check pod status
kubectl get pods -n idp
```

## Troubleshooting

### Backstage pod not starting

```bash
# Check pod details
kubectl describe pod -l app=backstage -n idp

# Check logs
kubectl logs -l app=backstage -n idp --tail=100

# Common issues:
# 1. Database connection - verify POSTGRES_HOST and credentials
# 2. Missing secrets - verify all secrets are properly base64 encoded
# 3. Image pull issues - verify GCR authentication
```

### Database connection errors

```bash
# Test PostgreSQL connectivity from Backstage pod
kubectl exec -it deployment/backstage -n idp -- /bin/sh
nc -zv postgresql.idp.svc.cluster.local 5432

# Check PostgreSQL is running
kubectl get pods -l app=postgresql -n idp
kubectl logs -l app=postgresql -n idp
```

### LoadBalancer not getting IP

```bash
# Check service events
kubectl describe svc backstage -n idp

# Verify GKE has available external IPs in your project
gcloud compute addresses list
```

## Updating Backstage

### To deploy a new version:

```bash
# 1. Build and push new image
bash build-and-push.sh v1.1.0

# 2. Update image tag in k8s/03-backstage-deployment.yaml
# Change: image: gcr.io/project-7d27fad9-61bb-42c4-b2e/backstage:latest
# To: image: gcr.io/project-7d27fad9-61bb-42c4-b2e/backstage:v1.1.0

# 3. Apply the update
kubectl apply -f k8s/03-backstage-deployment.yaml

# 4. Watch the rollout
kubectl rollout status deployment/backstage -n idp
```

## Clean Up

To remove Backstage from your cluster:

```bash
kubectl delete -f k8s/
```

## Production Considerations

For production deployments, consider:

1. **Managed Database**: Use Cloud SQL instead of in-cluster PostgreSQL
2. **HTTPS/TLS**: Configure Ingress with TLS certificates
3. **Domain Name**: Use a custom domain instead of IP
4. **High Availability**: Increase replicas for Backstage deployment
5. **Resource Limits**: Adjust based on actual usage
6. **Monitoring**: Set up Cloud Monitoring and Logging
7. **Backup**: Configure automated backups for PostgreSQL
8. **Secrets Management**: Use Google Secret Manager instead of Kubernetes secrets

## Using Cloud SQL (Recommended for Production)

To use Cloud SQL instead of in-cluster PostgreSQL:

1. Create a Cloud SQL PostgreSQL instance
2. Create a service account with Cloud SQL Client role
3. Deploy Cloud SQL Proxy as a sidecar in Backstage pod
4. Update POSTGRES_HOST to `127.0.0.1`
5. Skip deploying `02-postgresql.yaml`

Example Cloud SQL Proxy sidecar (add to 03-backstage-deployment.yaml):

```yaml
- name: cloud-sql-proxy
  image: gcr.io/cloud-sql-connectors/cloud-sql-proxy:latest
  args:
    - "--structured-logs"
    - "--port=5432"
    - "project-7d27fad9-61bb-42c4-b2e:REGION:INSTANCE_NAME"
  securityContext:
    runAsNonRoot: true
```
