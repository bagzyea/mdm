#!/usr/bin/env bash
# Set a local MDM password for an account, from the server. For a forgotten password,
# or the first sign-in of a new account. Directory (AD) users do not need this.
#
#   ops/set-password.sh admin              # prompts for the new password
#   ops/set-password.sh admin@mdm.local
#
# Also re-activates the account and revokes its existing sessions.
set -euo pipefail

ACCOUNT="${1:?usage: ops/set-password.sh <username-or-email>}"
CONTAINER=mdm-mdm-backend-1

read -r -s -p "New password for $ACCOUNT (min 12 chars): " PW; echo
read -r -s -p "Repeat: " PW2; echo
[ "$PW" = "$PW2" ] || { echo "Passwords differ."; exit 1; }
[ "${#PW}" -ge 12 ] || { echo "Use at least 12 characters."; exit 1; }

docker exec -i -e ACCOUNT="$ACCOUNT" -e NEW_PW="$PW" -w /repo/backend "$CONTAINER" node - <<'EOF'
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const who = process.env.ACCOUNT;
  const user = await prisma.user.findFirst({
    where: { OR: [
      { username: { equals: who, mode: 'insensitive' } },
      { email: { equals: who, mode: 'insensitive' } }
    ] }
  });
  if (!user) { console.error(`No MDM account "${who}".`); process.exit(1); }
  await prisma.user.update({
    where: { id: user.id },
    data: { password: await bcrypt.hash(process.env.NEW_PW, 12), isActive: true }
  });
  await prisma.refreshToken.updateMany({ where: { userId: user.id, isRevoked: false }, data: { isRevoked: true } });
  console.log(`Password set for ${user.username} (${user.email}, ${user.role}).`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
EOF
