function toSafeUser(user) {
  if (!user) return null;
  const source = typeof user.toObject === "function" ? user.toObject() : user;
  const { password, __v, ...safeUser } = source;
  return safeUser;
}

module.exports = { toSafeUser };
