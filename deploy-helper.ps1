# PowerShell helper script for deploying Backstage to GKE
# Usage: .\deploy-helper.ps1

param(
    [Parameter(Mandatory=$false)]
    [string]$ClusterName = "",

    [Parameter(Mandatory=$false)]
    [string]$Region = "",

    [Parameter(Mandatory=$false)]
    [string]$GitHubToken = "",

    [Parameter(Mandatory=$false)]
    [string]$PostgresPassword = ""
)

$PROJECT_ID = "project-7d27fad9-61bb-42c4-b2e"
$NAMESPACE = "idp"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Backstage GKE Deployment Helper" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Function to encode base64
function Get-Base64 {
    param([string]$text)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
    return [Convert]::ToBase64String($bytes)
}

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

$gcloudCheck = Get-Command gcloud -ErrorAction SilentlyContinue
if (-not $gcloudCheck) {
    Write-Host "ERROR: gcloud CLI not found. Please install Google Cloud SDK." -ForegroundColor Red
    exit 1
}

$kubectlCheck = Get-Command kubectl -ErrorAction SilentlyContinue
if (-not $kubectlCheck) {
    Write-Host "ERROR: kubectl not found. Please install kubectl." -ForegroundColor Red
    exit 1
}

Write-Host "✓ Prerequisites OK" -ForegroundColor Green
Write-Host ""

# Get cluster info if not provided
if ($ClusterName -eq "") {
    $ClusterName = Read-Host "Enter your GKE cluster name"
}

if ($Region -eq "") {
    $Region = Read-Host "Enter your GKE region (e.g., us-central1)"
}

# Connect to cluster
Write-Host "Connecting to GKE cluster..." -ForegroundColor Yellow
gcloud container clusters get-credentials $ClusterName --region $Region --project $PROJECT_ID

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to connect to cluster" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Connected to cluster" -ForegroundColor Green
Write-Host ""

# Get secrets if not provided
if ($GitHubToken -eq "") {
    $GitHubToken = Read-Host "Enter your GitHub Personal Access Token"
}

if ($PostgresPassword -eq "") {
    $PostgresPassword = Read-Host "Enter PostgreSQL password (will be created)"
}

# Encode secrets
Write-Host "Encoding secrets..." -ForegroundColor Yellow
$GitHubTokenBase64 = Get-Base64 $GitHubToken
$PostgresPasswordBase64 = Get-Base64 $PostgresPassword
$PostgresUserBase64 = Get-Base64 "backstage"
$PostgresHostBase64 = Get-Base64 "postgresql.idp.svc.cluster.local"
$PostgresPortBase64 = Get-Base64 "5432"

Write-Host "✓ Secrets encoded" -ForegroundColor Green
Write-Host ""

# Create secrets file
Write-Host "Creating secrets file..." -ForegroundColor Yellow
$secretsContent = @"
apiVersion: v1
kind: Secret
metadata:
  name: backstage-secrets
  namespace: idp
type: Opaque
data:
  GITHUB_TOKEN: $GitHubTokenBase64
  POSTGRES_USER: $PostgresUserBase64
  POSTGRES_PASSWORD: $PostgresPasswordBase64
  POSTGRES_HOST: $PostgresHostBase64
  POSTGRES_PORT: $PostgresPortBase64
"@

$secretsContent | Out-File -FilePath "k8s\01-secrets-generated.yaml" -Encoding UTF8
Write-Host "✓ Secrets file created: k8s\01-secrets-generated.yaml" -ForegroundColor Green
Write-Host ""

# Deploy
Write-Host "Deploying to GKE..." -ForegroundColor Yellow
Write-Host ""

Write-Host "1. Creating namespace..." -ForegroundColor Cyan
kubectl apply -f k8s\00-namespace.yaml

Write-Host "2. Creating secrets..." -ForegroundColor Cyan
kubectl apply -f k8s\01-secrets-generated.yaml

Write-Host "3. Deploying PostgreSQL..." -ForegroundColor Cyan
kubectl apply -f k8s\02-postgresql.yaml

Write-Host "4. Waiting for PostgreSQL to be ready (this may take 2-3 minutes)..." -ForegroundColor Cyan
kubectl wait --for=condition=ready pod -l app=postgresql -n $NAMESPACE --timeout=180s

if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: PostgreSQL may not be ready yet" -ForegroundColor Yellow
}

Write-Host "5. Deploying Backstage..." -ForegroundColor Cyan
kubectl apply -f k8s\03-backstage-deployment.yaml

Write-Host "6. Creating LoadBalancer service..." -ForegroundColor Cyan
kubectl apply -f k8s\04-backstage-service.yaml

Write-Host ""
Write-Host "✓ Deployment initiated" -ForegroundColor Green
Write-Host ""

# Wait for LoadBalancer IP
Write-Host "Waiting for LoadBalancer IP (this may take 2-3 minutes)..." -ForegroundColor Yellow

$retries = 0
$maxRetries = 30
$loadBalancerIP = ""

while ($retries -lt $maxRetries) {
    $retries++
    $service = kubectl get svc backstage -n $NAMESPACE -o json | ConvertFrom-Json

    if ($service.status.loadBalancer.ingress) {
        $loadBalancerIP = $service.status.loadBalancer.ingress[0].ip
        if ($loadBalancerIP) {
            break
        }
    }

    Write-Host "." -NoNewline
    Start-Sleep -Seconds 10
}

Write-Host ""

if ($loadBalancerIP) {
    Write-Host "✓ LoadBalancer IP assigned: $loadBalancerIP" -ForegroundColor Green
    Write-Host ""

    # Update deployment with LoadBalancer IP
    Write-Host "Updating Backstage with LoadBalancer URL..." -ForegroundColor Yellow
    kubectl set env deployment/backstage BACKSTAGE_BASE_URL=http://$loadBalancerIP -n $NAMESPACE
    kubectl rollout restart deployment/backstage -n $NAMESPACE

    Write-Host "Waiting for rollout to complete..." -ForegroundColor Yellow
    kubectl rollout status deployment/backstage -n $NAMESPACE --timeout=5m

    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Green
    Write-Host "Deployment Complete!" -ForegroundColor Green
    Write-Host "=========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Backstage URL: http://$loadBalancerIP" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Open http://$loadBalancerIP in your browser" -ForegroundColor White
    Write-Host "2. Check logs: kubectl logs -f deployment/backstage -n idp" -ForegroundColor White
    Write-Host "3. Check status: kubectl get all -n idp" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "WARNING: LoadBalancer IP not assigned yet" -ForegroundColor Yellow
    Write-Host "Run this command to check status:" -ForegroundColor White
    Write-Host "  kubectl get svc backstage -n idp --watch" -ForegroundColor Cyan
    Write-Host ""
}

Write-Host "Deployment logs saved to: k8s\01-secrets-generated.yaml" -ForegroundColor Gray
Write-Host "Delete this file after deployment for security" -ForegroundColor Red
