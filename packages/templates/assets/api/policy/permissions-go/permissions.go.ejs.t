---
to: <%= policyPath %>
---
// Package permissions is the SINGLE definition of who may do what.
//
// The Go expression of the same policy the TypeScript and Python layers enforce. The roles, the
// permissions and the matrix mapping one to the other are identical by contract, not by
// convention: the generator's policy-contract test parses all three files and fails if they
// disagree.
//
// These strings are the database's role values verbatim — there is deliberately no mapping layer
// between what is stored and what this policy checks. A translation table between ADMIN and admin
// is exactly the kind of seam where an unmapped value silently becomes "no permissions", failing
// open or closed depending on the call site.
package permissions

type Role string

const (
	RoleViewer Role = "viewer"
	RoleEditor Role = "editor"
	RoleAdmin  Role = "admin"
	// Same permissions as admin. The difference is structural: an organisation must always have
	// at least one active owner, and the API refuses any change that would remove the last one.
	RoleOwner Role = "owner"
)

type Permission string

const (
	PermissionRead           Permission = "read"
	PermissionWrite          Permission = "write"
	PermissionDelete         Permission = "delete"
	PermissionManageUsers    Permission = "manage:users"
	PermissionManageSettings Permission = "manage:settings"
)

var rolePermissions = map[Role][]Permission{
	"viewer": {"read"},
	"editor": {"read", "write", "delete"},
	"admin":  {"read", "write", "delete", "manage:users", "manage:settings"},
	"owner":  {"read", "write", "delete", "manage:users", "manage:settings"},
}

// Resolver is consulted before the defaults, when something has installed one.
//
// The settings module makes the matrix editable and stores the differences in the database.
// Rather than teach the auth middleware about that table, the store registers itself here and
// every existing caller keeps working unchanged. Returning nil means "no opinion, use the
// default" — which is different from returning false, and conflating the two would make every
// unlisted pair a denial the moment any override existed.
type Resolver func(role Role, permission Permission) *bool

var resolver Resolver

func SetResolver(next Resolver) {
	resolver = next
}

func Has(role Role, permission Permission) bool {
	if resolver != nil {
		if override := resolver(role, permission); override != nil {
			return *override
		}
	}

	for _, granted := range rolePermissions[role] {
		if granted == permission {
			return true
		}
	}
	return false
}

// For returns the compiled-in defaults, ignoring any resolver.
func For(role Role) []Permission {
	return rolePermissions[role]
}

// IsRole narrows an untrusted string — a JWT claim, a query parameter — to a role.
func IsRole(value string) bool {
	_, known := rolePermissions[Role(value)]
	return known
}
