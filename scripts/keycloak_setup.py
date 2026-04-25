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
        err = e.read().decode()
        if e.code == 409:
            print(f"  already exists, skipping")
            return None
        print(f"  ERROR {e.code}: {err}")
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
ALL_ROLES = ["admin", "platform", "infra", "viewer", "dev", "qa"]
print("\nCreating roles...")
for role in ALL_ROLES:
    print(f"  role '{role}'...", end=" ")
    api("POST", f"/admin/realms/{REALM}/roles", {"name": role})

# Fetch all roles for later lookup
all_roles = api("GET", f"/admin/realms/{REALM}/roles")
role_map = {r["name"]: r for r in all_roles}

def create_user(username, password, role):
    print(f"\nUser '{username}' (role: {role})...")

    # Create user
    api("POST", f"/admin/realms/{REALM}/users", {
        "username": username,
        "enabled": True,
        "emailVerified": True,
        "email": f"{username}@idp.internal",
        "firstName": username,
        "lastName": role.capitalize(),
        "credentials": [{
            "type": "password",
            "value": password,
            "temporary": False
        }]
    })

    # Get user ID
    users = api("GET", f"/admin/realms/{REALM}/users?username={username}")
    if not users:
        print(f"  ERROR: could not find user after creation")
        return
    user_id = users[0]["id"]

    # Assign role
    r = role_map.get(role)
    if not r:
        print(f"  ERROR: role '{role}' not found")
        return
    api("POST", f"/admin/realms/{REALM}/users/{user_id}/role-mappings/realm", [r])
    print(f"  OK — id={user_id}")

# Test users: username, password, role
TEST_USERS = [
    ("testadmin",    "Test@1234",         "admin"),
    ("platformuser1","platformuser1@123", "platform"),
    ("infrauser1",   "infrauser1@123",    "infra"),
    ("devuser1",     "devuser1@123",      "dev"),
    ("qauser1",      "qauser1@123",       "qa"),
    ("vieweruser1",  "vieweruser1@123",   "viewer"),
]

print("\nCreating test users...")
for username, password, role in TEST_USERS:
    create_user(username, password, role)

print("\nDone! Summary of test users:")
print(f"{'Username':<20} {'Password':<25} {'Role'}")
print("-" * 55)
for username, password, role in TEST_USERS:
    print(f"{username:<20} {password:<25} {role}")
print("\nLog out of Backstage and log back in with any of these users.")
