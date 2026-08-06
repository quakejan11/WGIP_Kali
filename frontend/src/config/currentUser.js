export const currentUser = {
  name: "Admin",
  role: "admin",
};

export function isAdmin() {
  return currentUser.role === "admin";
}