/** Existing active memberships remain usable; claiming an invitation requires mailbox proof. */
export function assertVerifiedMembershipClaim(
  emailVerified: boolean | null | undefined,
  membership: { userId: string | null; status: string },
): void {
  if (
    (!membership.userId || membership.status === 'INVITED') &&
    emailVerified !== true
  ) {
    throw new Error(
      'Verify your email address before accepting a workspace invitation.',
    )
  }
}
