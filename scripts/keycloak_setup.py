#!/usr/bin/env python3
import urllib.request, urllib.parse, json, sys

BASE = "http://136.113.61.100:8080"
ADMIN_USER = "admin"
ADMIN_PASS = "admin123"
REALM = "backstage"
CLIENT_ID = "backstage-client"

data = urllib.parse.urlencode({
    "username": ADMIN_USER, "password": ADMIN_PASS,
    "grant_type": "password", "client_id": "admin-cli"
}).encode()
token = json.loads(urllib.request.urlopen(
    BASE + "/realms/master/protocol/openid-connect/token", data=data
).read())["access_token"]
print("Authenticated as", ADMIN_USER)

H = {"Authorization": "Bearer " + token, "Content-Type": "application/json"}

def api(method, path, body=None):
    req = urllib.request.Request(
        BASE + path, headers=H, method=method,
        data=json.dumps(body).encode() if body else None
    )
    try:
        resp = urllib.request.urlopen(req)
        content = resp.read()
        return json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        if e.code == 409:
            print(f"  already exists, skipping")
            return None
        print(f"  ERROR {e.code}: {body}")
        return None

# Get client UUID
clients = api("GET", f"/admin/realms/{REALM}/clients?clientId={CLIENT_ID}")
client_uuid = clients[0]["id"]
print(f"Client UUID: {client_uuid}")

# Add realm roles mapper to ID token
print("Adding realm roles mapper...")
api("POST", f"/admin/realms/{REALM}/clients/{client_uuid}/protocol-mappers/models", {
    "name": "realm-roles",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-usermodel-realm-role-mapper",
    "config": {
        "multivalued": "true",
        "id.token.claim": "true",
        "access.token.claim": "true",
        "userinfo.token.claim": "true",
        "claim.name": "realm_access.roles",
        "jsonType.label": "String"
    }
})

# Create IDP roles
for role in ["admin", "platform", "infra", "viewer", "dev", "qa"]:
    print(f"Creating role '{role}'...")
    api("POST", f"/admin/realms/{REALM}/roles", {"name": role})

# Assign admin role to testadmin
print("Assigning admin role to testadmin...")
users = api("GET", f"/admin/realms/{REALM}/users?username=testadmin")
if not users:
    print("ERROR: testadmin user not found")
    sys.exit(1)
user_id = users[0]["id"]
roles = api("GET", f"/admin/realms/{REALM}/roles")
admin_role = next((r for r in roles if r["name"] == "admin"), None)
if not admin_role:
    print("ERROR: admin role not found")
    sys.exit(1)
api("POST", f"/admin/realms/{REALM}/users/{user_id}/role-mappings/realm", [admin_role])
print("Done! Log out of Backstage and log back in.")
