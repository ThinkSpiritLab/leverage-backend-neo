# Deployment

The maintained deployment instructions are in [deploy/README.md](../deploy/README.md).
The supplied Compose stack currently runs the API, database, Redis, frontend and
reverse proxy. Before accepting judge jobs, provision a trusted Docker-capable
worker with access to the same database, Redis and test-case volume.

See [backend roles](BACKEND_ROLES.md) and [sandbox limits](JUDGE_SANDBOX.md).
