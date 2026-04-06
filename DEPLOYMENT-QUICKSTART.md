# Backstage GKE Deployment - Quick Start Guide

## Quick Deployment Steps

### 1. Prerequisites Check

```bash
# Verify tools are installed
gcloud version
kubectl version --client
docker --version

# Authenticate and set project
gcloud auth login
gcloud config set project project-7d27fad9-61bb-42c4-b2e

# Connect to your GKE cluster
gcloud container clusters get-credentials YOUR_CLUSTER_NAME --region YOUR_REGION
```

### 2. Prepare Secrets

Create a file `secrets.env` with your actual values (do not commit this file):

```bash
# GitHub Token (get from https://github.com/settings/tokens)
GITHUB_TOKEN=ghp_your_actual_token_here

# PostgreSQL Password (choose a strong password)
POSTGRES_PASSWORD=your-secure-password-here
```

Encode the secrets:

```bash
# GitHub Token
echo -n "ghp_your_actual_token_here" | base64
# Copy the output

# PostgreSQL Password
echo -n "your-secure-password-here" | base64
# Copy the output
```

Edit `k8s/01-secrets.yaml` and replace:
- `REPLACE_WITH_BASE64_ENCODED_GITHUB_TOKEN` with your encoded GitHub token
- `REPLACE_WITH_BASE64_ENCODED_PASSWORD` with your encoded PostgreSQL password

### 3. Build and Push Image

```bash
cd C:\Tapas\POC\Platform\IDP\backstage

# Build and push (this will take 5-10 minutes)
bash build-and-push.sh v1.0.0
```

### 4. Deploy to GKE

```bash
# Deploy everything
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-secrets.yaml
kubectl apply -f k8s/02-postgresql.yaml

# Wait for PostgreSQL (about 1-2 minutes)
echo "Waiting for PostgreSQL to be ready..."
kubectl wait --for=condition=ready pod -l app=postgresql -n idp --timeout=180s

# Deploy Backstage
kubectl apply -f k8s/03-backstage-deployment.yaml
kubectl apply -f k8s/04-backstage-service.yaml

# Watch the deployment
kubectl get pods -n idp --watch
```

### 5. Get LoadBalancer IP

```bash
# This command will watch until IP is assigned (may take 2-3 minutes)
kubectl get svc backstage -n idp --watch

# When you see EXTERNAL-IP (not <pending>), press Ctrl+C

# Get the IP
export LB_IP=$(kubectl get svc backstage -n idp -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "LoadBalancer IP: $LB_IP"
```

### 6. Update Backstage Configuration

```bash
# Update the BACKSTAGE_BASE_URL in the deployment
# Method 1: Using kubectl set env
kubectl set env deployment/backstage BACKSTAGE_BASE_URL=http://$LB_IP -n idp

# Method 2: Or edit the file manually
# Edit k8s/03-backstage-deployment.yaml
# Change: value: "http://REPLACE_WITH_LOAD_BALANCER_IP:7007"
# To: value: "http://YOUR_ACTUAL_IP"
# Then: kubectl apply -f k8s/03-backstage-deployment.yaml

# Restart to apply changes
kubectl rollout restart deployment/backstage -n idp

# Wait for rollout to complete
kubectl rollout status deployment/backstage -n idp
```

### 7. Access Backstage

```bash
# Print the URL
echo "Backstage is available at: http://$LB_IP"

# Or open directly (on Windows)
start http://$LB_IP

# On Linux/Mac
xdg-open http://$LB_IP  # or 'open' on Mac
```

## Verification Commands

```bash
# Check all resources
kubectl get all -n idp

# Check Backstage logs
kubectl logs -f deployment/backstage -n idp

# Check if Backstage is healthy
kubectl exec deployment/backstage -n idp -- curl -f http://localhost:7007/healthcheck

# Get service details
kubectl describe svc backstage -n idp
```

## Expected Output

When everything is working, you should see:

```bash
$ kubectl get all -n idp
NAME                             READY   STATUS    RESTARTS   AGE
pod/backstage-xxxxxxxxxx-xxxxx   1/1     Running   0          5m
pod/postgresql-xxxxxxxxx-xxxxx   1/1     Running   0          8m

NAME                 TYPE           CLUSTER-IP     EXTERNAL-IP      PORT(S)        AGE
service/backstage    LoadBalancer   10.XX.XX.XX    35.XXX.XXX.XXX   80:XXXXX/TCP   5m
service/postgresql   ClusterIP      10.XX.XX.XX    <none>           5432/TCP       8m

NAME                         READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/backstage    1/1     1            1           5m
deployment.apps/postgresql   1/1     1            1           8m
```

## Troubleshooting

### Pod stuck in "Pending" or "ContainerCreating"

```bash
kubectl describe pod -l app=backstage -n idp
# Look for events at the bottom
```

### Pod in "CrashLoopBackOff"

```bash
# Check logs
kubectl logs -l app=backstage -n idp --tail=100

# Common issues:
# - Database connection failed -> check secrets
# - Image pull error -> verify GCR authentication
```

### Can't access Backstage

```bash
# Verify service has external IP
kubectl get svc backstage -n idp

# Test from within cluster
kubectl run test-pod --image=curlimages/curl -i --rm --restart=Never -- \
  curl -v http://backstage.idp.svc.cluster.local:80
```

### Need to check database

```bash
# Connect to PostgreSQL
kubectl exec -it deployment/postgresql -n idp -- psql -U backstage -d backstage

# Inside psql, run:
# \dt  -- list tables
# SELECT * FROM backstage_backend_tasks__tasks LIMIT 5;
# \q   -- quit
```

## Cleanup

To remove everything:

```bash
kubectl delete namespace idp
```

This will delete:
- All pods
- All deployments
- All services
- All persistent volumes
- All secrets

## Next Steps

1. Configure a custom domain name
2. Set up HTTPS with an Ingress and cert-manager
3. Migrate to Cloud SQL for production database
4. Set up monitoring and alerting
5. Configure backup and disaster recovery
6. Add authentication (OAuth, SAML, etc.)

See `k8s/README.md` for detailed production considerations.
