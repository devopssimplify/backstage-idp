# Backstage Quick Start Guide

## Start Backstage

```bash
# From the backstage directory
yarn dev
```

This starts:
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:7007

## Using the Provision Environment Template

1. Open http://localhost:3000 in your browser
2. Click **"Create"** in the left sidebar
3. Find and select **"Provision New Environment"**
4. Fill in the form:
   - **Environment Name**: e.g., `dev-team-a` or `staging`
   - **Team Owner**: Select from dropdown
   - **Description**: Brief description of environment purpose
   - **Infrastructure**: Check boxes for resources needed:
     - Cloud SQL (PostgreSQL database)
     - Cloud Storage (GCS bucket)
     - Memorystore (Redis cache)
5. Click **"Review"** and then **"Create"**

## What Happens Next

1. Backstage generates the YAML files based on your inputs
2. A new Git branch is created: `provision-{environment-name}`
3. A pull request is opened in the `devopssimplify/idp-poc-gitops` repo
4. Review the PR to see generated files:
   - `cluster/namespace-{env}.yaml` - Kubernetes namespace with quotas
   - `infra/cloudsql-{env}.yaml` - Cloud SQL instance (if enabled)
   - `infra/gcs-{env}.yaml` - GCS bucket (if enabled)
   - `infra/memorystore-{env}.yaml` - Redis instance (if enabled)
5. Merge the PR when ready
6. Config Sync automatically applies the changes to your GKE cluster
7. Config Connector provisions the GCP resources

## Template Structure

```
templates/provision-environment/
├── template.yaml           # Template definition with parameters and steps
└── skeleton/               # Files to be templated
    ├── cluster/
    │   └── namespace-*.yaml    # Namespace + ResourceQuota + LimitRange
    └── infra/
        ├── cloudsql-*.yaml     # SQLInstance + SQLDatabase + SQLUser
        ├── gcs-*.yaml          # StorageBucket + IAMServiceAccount
        └── memorystore-*.yaml  # RedisInstance
```

## Customizing the Template

### Edit Parameters

Edit `templates/provision-environment/template.yaml`:

```yaml
parameters:
  - title: Environment Information
    required:
      - environmentName
    properties:
      environmentName:
        title: Environment Name
        type: string
        # Add validation, defaults, etc.
```

### Modify Resource Specifications

Edit the skeleton files:
- `skeleton/cluster/namespace-*.yaml` - Change quotas, limits
- `skeleton/infra/cloudsql-*.yaml` - Change instance tier, disk size
- `skeleton/infra/gcs-*.yaml` - Change storage class, lifecycle rules
- `skeleton/infra/memorystore-*.yaml` - Change memory size, version

### Add New Resources

1. Create new YAML file in `skeleton/infra/`
2. Use templating syntax: `${{ values.propertyName }}`
3. Add conditional rendering: `{%- if values.enableFeature %}`
4. Add corresponding parameter in `template.yaml`

## Templating Syntax

Backstage uses [Nunjucks](https://mozilla.github.io/nunjucks/) for templating:

- **Variables**: `${{ values.environmentName }}`
- **Conditionals**:
  ```yaml
  {%- if values.enableCloudSQL %}
  # YAML content here
  {%- endif %}
  ```
- **Loops**:
  ```yaml
  {%- for item in values.items %}
  - name: ${{ item }}
  {%- endfor %}
  ```

## Troubleshooting

### Template not showing in UI
- Check `app-config.yaml` has the template registered
- Restart Backstage: Stop (Ctrl+C) and run `yarn dev` again
- Check for YAML syntax errors in `template.yaml`

### PR creation fails
- Verify `GITHUB_TOKEN` in `.env` file
- Check token has `repo` scope permissions
- Ensure the target repository exists
- Check backend logs in terminal for detailed error

### Invalid YAML generated
- Validate your skeleton YAML files
- Check template variable substitution
- Test with `yamllint` if available

### Resources not created in GCP
- Verify Config Sync is running: `kubectl get rootsync -A`
- Check Config Connector is installed: `kubectl get pods -n cnrm-system`
- Review Config Connector resource status: `kubectl describe <resource>`
- Check GCP project ID matches in YAMLs

## Next Steps

### Create More Templates

1. **Deploy Application Template**
   - Generate Deployment, Service, Ingress
   - Configure environment-specific variables
   - Set up HPA (Horizontal Pod Autoscaler)

2. **Database Migration Template**
   - Generate Cloud SQL migration jobs
   - Configure schema initialization
   - Set up backup schedules

3. **Monitoring Template**
   - Deploy Prometheus exporters
   - Create Grafana dashboards
   - Configure alerting rules

### Enhance Security

- Add approval workflows for production environments
- Implement cost estimation before provisioning
- Add compliance checks (policy validation)
- Use Workload Identity instead of service account keys

## Useful Commands

```bash
# View catalog entities
curl http://localhost:7007/api/catalog/entities | jq

# Check template registration
curl http://localhost:7007/api/catalog/entities?filter=kind=Template | jq

# View scaffolder tasks
curl http://localhost:7007/api/scaffolder/v2/tasks | jq

# Restart backend only
cd packages/backend && yarn start

# Restart frontend only
cd packages/app && yarn start

# Clear node_modules and reinstall
yarn clean && yarn install
```

## Resources

- [Backstage Software Templates](https://backstage.io/docs/features/software-templates/)
- [Template Actions Reference](https://backstage.io/docs/features/software-templates/builtin-actions)
- [Nunjucks Templating](https://mozilla.github.io/nunjucks/templating.html)
