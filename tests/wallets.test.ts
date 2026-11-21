import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { type AppDb, closeDb, createDb, getDb } from "@/db";
import { walletInvites, walletMembers, wallets } from "@/db/schema";
import { SESSION_COOKIE_NAME, registerUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import {
  acceptWalletInvite,
  assertWalletAccess,
  createWallet,
  createWalletInvite,
  getInviteByToken,
  listPendingInvitesForEmail,
  listUserWallets,
  listWalletInvites,
  maskInviteEmail,
  removeWalletMember,
  updateWallet,
} from "@/lib/wallets";

let mockSessionCookie: string | undefined;

mock.module("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE_NAME && mockSessionCookie
        ? { name, value: mockSessionCookie }
        : undefined,
  }),
}));

import { GET as listMyInvitesRoute } from "@/app/api/invites/route";
import { POST as acceptInviteRoute } from "@/app/api/invites/[token]/accept/route";
import { GET as getInvitePreviewRoute } from "@/app/api/invites/[token]/route";
import { PATCH as updateWalletRoute } from "@/app/api/wallets/[id]/route";
import {
  GET as listWalletInvitesRoute,
  POST as createWalletInviteRoute,
} from "@/app/api/wallets/[id]/invites/route";
import { DELETE as removeWalletMemberRoute } from "@/app/api/wallets/[id]/members/[userId]/route";
import {
  GET as listWalletsRoute,
  POST as createWalletRoute,
} from "@/app/api/wallets/route";

async function expectAppError(
  fn: () => unknown | Promise<unknown>,
  expectedStatus: number
): Promise<AppError> {
  let caught: unknown;
  try {
    await fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(AppError);
  const appErr = caught as AppError;
  expect(appErr.status).toBe(expectedStatus);
  return appErr;
}

describe("Wallets, Shared Family RBAC & Single-Use Invitation Flow", () => {
  test("createWallet sets balance === initialBalance, creates owner row in wallet_members, and validates initialBalance", async () => {
    const { db, close } = await createDb(":memory:");
    try {
      const reg = await registerUser(db, {
        name: "Budi Santoso",
        email: "budi@aruskas.test",
        password: "Password123!",
      });

      const created = await createWallet(db, reg.user.id, {
        name: "  Tabungan Keluarga  ",
        type: "savings",
        initialBalance: 2500000,
      });

      expect(created.name).toBe("Tabungan Keluarga");
      expect(created.type).toBe("savings");
      expect(created.initialBalance).toBe(2500000);
      expect(created.balance).toBe(2500000);
      expect(created.isShared).toBe(false);
      expect(created.archivedAt).toBeNull();
      expect(created.ownerId).toBe(reg.user.id);
      expect(created.ownerName).toBe("Budi Santoso");
      expect(created.role).toBe("owner");
      expect(created.members).toHaveLength(1);
      expect(created.members[0]).toMatchObject({
        userId: reg.user.id,
        name: "Budi Santoso",
        email: "budi@aruskas.test",
        role: "owner",
      });

      const memberRow = await db
        .select()
        .from(walletMembers)
        .where(eq(walletMembers.walletId, created.id));
      expect(memberRow).toHaveLength(1);
      expect(memberRow[0].userId).toBe(reg.user.id);
      expect(memberRow[0].role).toBe("owner");

      await expectAppError(
        () =>
          createWallet(db, reg.user.id, {
            name: "Dompet Minus",
            type: "cash",
            initialBalance: -100,
          }),
        400
      );

      await expectAppError(
        () =>
          createWallet(db, reg.user.id, {
            name: "Dompet Pecahan",
            type: "cash",
            initialBalance: 100.5,
          }),
        400
      );

      await expectAppError(
        () =>
          createWallet(db, reg.user.id, {
            name: "Dompet Terlalu Besar",
            type: "cash",
            initialBalance: Number.MAX_SAFE_INTEGER + 1,
          }),
        400
      );
    } finally {
      await close();
    }
  });

  test("assertWalletAccess enforces permission matrix (404 missing, 403 non-member, viewer < editor < owner)", async () => {
    const { db, close } = await createDb(":memory:");
    try {
      const owner = await registerUser(db, {
        name: "Pemilik",
        email: "owner@aruskas.test",
        password: "Password123!",
      });
      const editor = await registerUser(db, {
        name: "Editor",
        email: "editor@aruskas.test",
        password: "Password123!",
      });
      const viewer = await registerUser(db, {
        name: "Viewer",
        email: "viewer@aruskas.test",
        password: "Password123!",
      });
      const outsider = await registerUser(db, {
        name: "Orang Luar",
        email: "outsider@aruskas.test",
        password: "Password123!",
      });

      const wallet = await createWallet(db, owner.user.id, {
        name: "Dompet Bersama",
        type: "bank",
        initialBalance: 1000000,
      });

      const editorInvite = await createWalletInvite(db, wallet.id, owner.user.id, {
        email: editor.user.email,
        role: "editor",
      });
      await acceptWalletInvite(db, editorInvite.token, editor.user);

      const viewerInvite = await createWalletInvite(db, wallet.id, owner.user.id, {
        email: viewer.user.email,
        role: "viewer",
      });
      await acceptWalletInvite(db, viewerInvite.token, viewer.user);

      // Missing wallet -> 404
      await expectAppError(
        () => assertWalletAccess(db, "wallet-tidak-ada", owner.user.id, "viewer"),
        404
      );

      // Non-member -> 403
      await expectAppError(
        () => assertWalletAccess(db, wallet.id, outsider.user.id, "viewer"),
        403
      );

      // Viewer passes viewer, fails editor & owner
      expect(
        (await assertWalletAccess(db, wallet.id, viewer.user.id, "viewer")).role
      ).toBe("viewer");
      await expectAppError(
        () => assertWalletAccess(db, wallet.id, viewer.user.id, "editor"),
        403
      );
      await expectAppError(
        () => assertWalletAccess(db, wallet.id, viewer.user.id, "owner"),
        403
      );

      // Editor passes viewer & editor, fails owner
      expect(
        (await assertWalletAccess(db, wallet.id, editor.user.id, "viewer")).role
      ).toBe("editor");
      expect(
        (await assertWalletAccess(db, wallet.id, editor.user.id, "editor")).role
      ).toBe("editor");
      await expectAppError(
        () => assertWalletAccess(db, wallet.id, editor.user.id, "owner"),
        403
      );

      // Owner passes all
      expect(
        (await assertWalletAccess(db, wallet.id, owner.user.id, "viewer")).role
      ).toBe("owner");
      expect(
        (await assertWalletAccess(db, wallet.id, owner.user.id, "editor")).role
      ).toBe("owner");
      expect(
        (await assertWalletAccess(db, wallet.id, owner.user.id, "owner")).role
      ).toBe("owner");
    } finally {
      await close();
    }
  });

  test("updateWallet and listUserWallets handle owner-only updates and archive filtering", async () => {
    const { db, close } = await createDb(":memory:");
    try {
      const owner = await registerUser(db, {
        name: "Siti",
        email: "siti@aruskas.test",
        password: "Password123!",
      });
      const editor = await registerUser(db, {
        name: "Rudi",
        email: "rudi@aruskas.test",
        password: "Password123!",
      });

      const wallet = await createWallet(db, owner.user.id, {
        name: "GoPay Rumah",
        type: "ewallet",
        initialBalance: 500000,
      });

      const inv = await createWalletInvite(db, wallet.id, owner.user.id, {
        email: editor.user.email,
        role: "editor",
      });
      await acceptWalletInvite(db, inv.token, editor.user);

      // Editor cannot update wallet
      await expectAppError(
        () =>
          updateWallet(db, wallet.id, editor.user.id, {
            name: "Nama Diubah Editor",
          }),
        403
      );

      const updated = await updateWallet(db, wallet.id, owner.user.id, {
        name: "GoPay Keluarga",
        type: "bank",
        archived: true,
      });
      expect(updated.name).toBe("GoPay Keluarga");
      expect(updated.type).toBe("bank");
      expect(updated.archivedAt).not.toBeNull();

      const activeOnly = await listUserWallets(db, owner.user.id);
      expect(activeOnly.some((w) => w.id === wallet.id)).toBe(false);

      const withArchived = await listUserWallets(db, owner.user.id, {
        includeArchived: true,
      });
      const found = withArchived.find((w) => w.id === wallet.id);
      expect(found).toBeDefined();
      expect(found!.archivedAt).not.toBeNull();

      const unarchived = await updateWallet(db, wallet.id, owner.user.id, {
        archived: false,
      });
      expect(unarchived.archivedAt).toBeNull();
    } finally {
      await close();
    }
  });

  test("invitation flow: email targeting, pending invites list, wrong-user 403, self-invite 400, existing member 409, and accept sets isShared", async () => {
    const { db, close } = await createDb(":memory:");
    try {
      const userA = await registerUser(db, {
        name: "Andi",
        email: "andi@aruskas.test",
        password: "Password123!",
      });
      const userB = await registerUser(db, {
        name: "Dewi",
        email: "dewi@aruskas.test",
        password: "Password123!",
      });
      const userC = await registerUser(db, {
        name: "Candra",
        email: "candra@aruskas.test",
        password: "Password123!",
      });

      const wallet = await createWallet(db, userA.user.id, {
        name: "Belanja Bulanan",
        type: "bank",
        initialBalance: 3000000,
      });

      // Cannot invite self -> 400
      await expectAppError(
        () =>
          createWalletInvite(db, wallet.id, userA.user.id, {
            email: "ANDI@aruskas.test",
            role: "editor",
          }),
        400
      );

      // Owner invites User B by email (uppercase should normalize to lowercase)
      const invite = await createWalletInvite(db, wallet.id, userA.user.id, {
        email: "  DEWI@ArusKas.test ",
        role: "editor",
      });
      expect(invite.email).toBe("dewi@aruskas.test");
      expect(invite.role).toBe("editor");
      expect(invite.token).toMatch(/^[0-9a-f]{64}$/);
      expect(invite.acceptedAt).toBeNull();

      // Pending invites for B shows the invite; C sees none
      const pendingB = await listPendingInvitesForEmail(db, userB.user.email);
      expect(pendingB).toHaveLength(1);
      expect(pendingB[0].token).toBe(invite.token);
      expect(pendingB[0].walletName).toBe("Belanja Bulanan");
      expect(pendingB[0].inviterName).toBe("Andi");

      expect(await listPendingInvitesForEmail(db, userC.user.email)).toHaveLength(0);

      // Public preview works
      const preview = await getInviteByToken(db, invite.token);
      expect(preview.walletName).toBe("Belanja Bulanan");
      expect(preview.email).toBe("dewi@aruskas.test");

      // User C attempting to accept gets 403
      await expectAppError(
        () => acceptWalletInvite(db, invite.token, userC.user),
        403
      );

      // Invite is still pending for B after C's failed attempt
      expect(await listPendingInvitesForEmail(db, userB.user.email)).toHaveLength(1);

      // User B accepts -> joins wallet & isShared === true
      const accepted = await acceptWalletInvite(db, invite.token, userB.user);
      expect(accepted).toEqual({
        walletId: wallet.id,
        walletName: "Belanja Bulanan",
        role: "editor",
      });

      // Pending invites for B is now empty
      expect(await listPendingInvitesForEmail(db, userB.user.email)).toHaveLength(0);

      // Wallet isShared is now true and members include A & B
      const [dbWallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.id, wallet.id));
      expect(dbWallet!.isShared).toBe(true);

      const bWallets = await listUserWallets(db, userB.user.id);
      const sharedWallet = bWallets.find((w) => w.id === wallet.id);
      expect(sharedWallet).toBeDefined();
      expect(sharedWallet!.role).toBe("editor");
      expect(sharedWallet!.members).toHaveLength(2);

      // Inviting existing member User B again -> 409
      await expectAppError(
        () =>
          createWalletInvite(db, wallet.id, userA.user.id, {
            email: userB.user.email,
            role: "viewer",
          }),
        409
      );

      // listWalletInvites (owner only) shows invite with acceptedAt set
      const ownerInvites = await listWalletInvites(db, wallet.id, userA.user.id);
      expect(ownerInvites).toHaveLength(1);
      expect(ownerInvites[0].acceptedAt).not.toBeNull();

      await expectAppError(
        () => listWalletInvites(db, wallet.id, userB.user.id),
        403
      );
    } finally {
      await close();
    }
  });

  test("Review Focus: reusing an accepted invite token throws 410 and does not duplicate wallet_members; expired invite (>7 days) throws 410", async () => {
    const { db, close } = await createDb(":memory:");
    try {
      const owner = await registerUser(db, {
        name: "Pemilik Utama",
        email: "pemilik@aruskas.test",
        password: "Password123!",
      });
      const partner = await registerUser(db, {
        name: "Pasangan",
        email: "pasangan@aruskas.test",
        password: "Password123!",
      });
      const thirdUser = await registerUser(db, {
        name: "Tamu Ketiga",
        email: "tamu@aruskas.test",
        password: "Password123!",
      });

      const wallet = await createWallet(db, owner.user.id, {
        name: "Dompet Liburan",
        type: "savings",
        initialBalance: 4000000,
      });

      // Open invite (email: null) accepted once by partner
      const openInvite = await createWalletInvite(db, wallet.id, owner.user.id, {
        email: null,
        role: "viewer",
      });
      await acceptWalletInvite(db, openInvite.token, partner.user);

      // Reusing same token (by partner OR by another user) must throw AppError(410)
      await expectAppError(
        () => acceptWalletInvite(db, openInvite.token, partner.user),
        410
      );
      await expectAppError(
        () => acceptWalletInvite(db, openInvite.token, thirdUser.user),
        410
      );
      await expectAppError(
        () => getInviteByToken(db, openInvite.token),
        410
      );

      // Verify wallet_members was not duplicated (only owner + partner)
      const members = await db
        .select()
        .from(walletMembers)
        .where(eq(walletMembers.walletId, wallet.id));
      expect(members).toHaveLength(2);

      // Expired invite (>7 days old) throws AppError(410)
      const expiredInvite = await createWalletInvite(db, wallet.id, owner.user.id, {
        email: thirdUser.user.email,
        role: "editor",
      });
      const eightDaysAgo = new Date(
        Date.now() - 8 * 24 * 60 * 60 * 1000
      ).toISOString();
      await db
        .update(walletInvites)
        .set({ expiresAt: eightDaysAgo })
        .where(eq(walletInvites.id, expiredInvite.id));

      await expectAppError(
        () => getInviteByToken(db, expiredInvite.token),
        410
      );
      await expectAppError(
        () => acceptWalletInvite(db, expiredInvite.token, thirdUser.user),
        410
      );
      expect(await listPendingInvitesForEmail(db, thirdUser.user.email)).toHaveLength(
        0
      );

      // Unknown token throws 404
      await expectAppError(
        () => getInviteByToken(db, "token-tidak-terdaftar"),
        404
      );
    } finally {
      await close();
    }
  });

  test("removeWalletMember works for owner, rejects removing self (400), and resets isShared to false when only owner remains", async () => {
    const { db, close } = await createDb(":memory:");
    try {
      const owner = await registerUser(db, {
        name: "Owner",
        email: "owner-rem@aruskas.test",
        password: "Password123!",
      });
      const member1 = await registerUser(db, {
        name: "Member Satu",
        email: "m1@aruskas.test",
        password: "Password123!",
      });
      const member2 = await registerUser(db, {
        name: "Member Dua",
        email: "m2@aruskas.test",
        password: "Password123!",
      });

      const wallet = await createWallet(db, owner.user.id, {
        name: "Dompet Keluarga",
        type: "bank",
        initialBalance: 1500000,
      });

      const inv1 = await createWalletInvite(db, wallet.id, owner.user.id, {
        email: member1.user.email,
        role: "editor",
      });
      await acceptWalletInvite(db, inv1.token, member1.user);

      const inv2 = await createWalletInvite(db, wallet.id, owner.user.id, {
        email: member2.user.email,
        role: "viewer",
      });
      await acceptWalletInvite(db, inv2.token, member2.user);

      // Non-owner cannot remove members -> 403
      await expectAppError(
        () =>
          removeWalletMember(db, wallet.id, member1.user.id, member2.user.id),
        403
      );

      // Owner cannot remove self -> 400
      await expectAppError(
        () => removeWalletMember(db, wallet.id, owner.user.id, owner.user.id),
        400
      );

      // Remove member1: member2 still remains, so isShared stays true
      await removeWalletMember(db, wallet.id, owner.user.id, member1.user.id);
      const [afterFirstRemoval] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.id, wallet.id));
      expect(afterFirstRemoval!.isShared).toBe(true);

      // Remove member2: only owner remains, so isShared resets to false
      await removeWalletMember(db, wallet.id, owner.user.id, member2.user.id);
      const [afterSecondRemoval] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.id, wallet.id));
      expect(afterSecondRemoval!.isShared).toBe(false);

      const remainingMembers = await db
        .select()
        .from(walletMembers)
        .where(eq(walletMembers.walletId, wallet.id));
      expect(remainingMembers).toHaveLength(1);
      expect(remainingMembers[0].userId).toBe(owner.user.id);
    } finally {
      await close();
    }
  });

  test("GET /api/invites/[token] returns masked public preview (200), 404 when unknown, and 410 once used", async () => {
    expect(maskInviteEmail(null)).toBeNull();
    expect(maskInviteEmail("a@example.com")).toBe("a***@example.com");
    expect(maskInviteEmail("budi@example.com")).toBe("bu***@example.com");

    const prevDbPath = process.env.DATABASE_PATH;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aruskas-invite-"));
    process.env.DATABASE_PATH = `memory://wallets-invite-${crypto.randomUUID()}`;

    try {
      const db = await getDb();
      const owner = await registerUser(db, {
        name: "Hendra",
        email: "hendra@aruskas.test",
        password: "Password123!",
      });
      const partner = await registerUser(db, {
        name: "Maya",
        email: "maya@aruskas.test",
        password: "Password123!",
      });
      const wallet = await createWallet(db, owner.user.id, {
        name: "Dompet Rumah",
        type: "bank",
        initialBalance: 2000000,
      });
      const invite = await createWalletInvite(db, wallet.id, owner.user.id, {
        email: "maya@aruskas.test",
        role: "editor",
      });

      const notFoundRes = await getInvitePreviewRoute(
        new Request("http://localhost/api/invites/tidak-ada"),
        { params: Promise.resolve({ token: "tidak-ada" }) }
      );
      expect(notFoundRes.status).toBe(404);

      const okRes = await getInvitePreviewRoute(
        new Request(`http://localhost/api/invites/${invite.token}`),
        { params: Promise.resolve({ token: invite.token }) }
      );
      expect(okRes.status).toBe(200);
      const okJson = (await okRes.json()) as {
        invite: {
          walletName: string;
          inviterName: string;
          role: string;
          emailMasked: string | null;
          requiresSpecificEmail: boolean;
        };
      };
      expect(okJson.invite.walletName).toBe("Dompet Rumah");
      expect(okJson.invite.inviterName).toBe("Hendra");
      expect(okJson.invite.role).toBe("editor");
      expect(okJson.invite.emailMasked).toBe("ma***@aruskas.test");
      expect(okJson.invite.requiresSpecificEmail).toBe(true);

      await acceptWalletInvite(db, invite.token, partner.user);

      const usedRes = await getInvitePreviewRoute(
        new Request(`http://localhost/api/invites/${invite.token}`),
        { params: Promise.resolve({ token: invite.token }) }
      );
      expect(usedRes.status).toBe(410);
    } finally {
      await closeDb();
      if (prevDbPath === undefined) {
        delete process.env.DATABASE_PATH;
      } else {
        process.env.DATABASE_PATH = prevDbPath;
      }
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore Windows SQLite file lock on temp dir cleanup
      }
    }
  });

  test("authenticated route handlers enforce 401, 400 malformed JSON, Indonesian Zod validation errors, and full HTTP lifecycle", async () => {
    const prevDbPath = process.env.DATABASE_PATH;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aruskas-routes-"));
    process.env.DATABASE_PATH = `memory://wallets-routes-${crypto.randomUUID()}`;
    mockSessionCookie = undefined;

    function jsonRequest(
      url: string,
      method: string,
      payload: unknown
    ): Request {
      return new Request(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    function badJsonRequest(url: string, method: string): Request {
      return new Request(url, {
        method,
        headers: { "content-type": "application/json" },
        body: "{tidak-valid",
      });
    }

    try {
      const db = await getDb();
      const owner = await registerUser(db, {
        name: "Rama",
        email: "rama@aruskas.test",
        password: "Password123!",
      });
      const partner = await registerUser(db, {
        name: "Nadia",
        email: "nadia@aruskas.test",
        password: "Password123!",
      });

      // 1. Unauthenticated requests -> 401 across all authenticated routes
      expect(
        (await listWalletsRoute(new Request("http://localhost/api/wallets")))
          .status
      ).toBe(401);
      expect(
        (
          await createWalletRoute(
            jsonRequest("http://localhost/api/wallets", "POST", {})
          )
        ).status
      ).toBe(401);
      expect(
        (
          await updateWalletRoute(
            jsonRequest("http://localhost/api/wallets/w1", "PATCH", {}),
            { params: Promise.resolve({ id: "w1" }) }
          )
        ).status
      ).toBe(401);
      expect(
        (
          await listWalletInvitesRoute(
            new Request("http://localhost/api/wallets/w1/invites"),
            { params: Promise.resolve({ id: "w1" }) }
          )
        ).status
      ).toBe(401);
      expect(
        (
          await createWalletInviteRoute(
            jsonRequest("http://localhost/api/wallets/w1/invites", "POST", {}),
            { params: Promise.resolve({ id: "w1" }) }
          )
        ).status
      ).toBe(401);
      expect(
        (
          await removeWalletMemberRoute(
            new Request("http://localhost/api/wallets/w1/members/u2", {
              method: "DELETE",
            }),
            { params: Promise.resolve({ id: "w1", userId: "u2" }) }
          )
        ).status
      ).toBe(401);
      expect((await listMyInvitesRoute()).status).toBe(401);
      expect(
        (
          await acceptInviteRoute(
            new Request("http://localhost/api/invites/tok/accept", {
              method: "POST",
            }),
            { params: Promise.resolve({ token: "tok" }) }
          )
        ).status
      ).toBe(401);

      // Authenticate as owner
      mockSessionCookie = owner.token;

      // 2. Malformed JSON -> 400
      const badPostWallet = await createWalletRoute(
        badJsonRequest("http://localhost/api/wallets", "POST")
      );
      expect(badPostWallet.status).toBe(400);

      const badPatchWallet = await updateWalletRoute(
        badJsonRequest("http://localhost/api/wallets/w1", "PATCH"),
        { params: Promise.resolve({ id: "w1" }) }
      );
      expect(badPatchWallet.status).toBe(400);

      const badPostInvite = await createWalletInviteRoute(
        badJsonRequest("http://localhost/api/wallets/w1/invites", "POST"),
        { params: Promise.resolve({ id: "w1" }) }
      );
      expect(badPostInvite.status).toBe(400);

      // 3. Indonesian Zod validation errors (no English leaks)
      const invalidEnumWallet = await createWalletRoute(
        jsonRequest("http://localhost/api/wallets", "POST", {
          name: "Dompet Kripto",
          type: "crypto",
          initialBalance: 0,
        })
      );
      expect(invalidEnumWallet.status).toBe(400);
      const invalidEnumWalletBody = (await invalidEnumWallet.json()) as {
        error: string;
      };
      expect(invalidEnumWalletBody.error).toBe("Tipe dompet tidak valid.");

      const missingTypeWallet = await createWalletRoute(
        jsonRequest("http://localhost/api/wallets", "POST", {
          name: "Dompet Tanpa Tipe",
          initialBalance: 0,
        })
      );
      expect(missingTypeWallet.status).toBe(400);
      expect(
        ((await missingTypeWallet.json()) as { error: string }).error
      ).toBe("Tipe dompet wajib dipilih.");

      const nonStringNameWallet = await createWalletRoute(
        jsonRequest("http://localhost/api/wallets", "POST", {
          name: 12345,
          type: "cash",
          initialBalance: 0,
        })
      );
      expect(nonStringNameWallet.status).toBe(400);
      expect(
        ((await nonStringNameWallet.json()) as { error: string }).error
      ).toBe("Nama dompet harus berupa teks.");

      // Create valid wallet via POST /api/wallets -> 201
      const createdRes = await createWalletRoute(
        jsonRequest("http://localhost/api/wallets", "POST", {
          name: "Rekening Bersama",
          type: "bank",
          initialBalance: 5000000,
        })
      );
      expect(createdRes.status).toBe(201);
      const createdJson = (await createdRes.json()) as {
        wallet: { id: string; name: string; balance: number };
      };
      const walletId = createdJson.wallet.id;
      expect(createdJson.wallet.name).toBe("Rekening Bersama");
      expect(createdJson.wallet.balance).toBe(5000000);

      // Invalid enum & non-string on PATCH /api/wallets/[id]
      const invalidPatchType = await updateWalletRoute(
        jsonRequest(`http://localhost/api/wallets/${walletId}`, "PATCH", {
          type: "crypto",
        }),
        { params: Promise.resolve({ id: walletId }) }
      );
      expect(invalidPatchType.status).toBe(400);
      expect(
        ((await invalidPatchType.json()) as { error: string }).error
      ).toBe("Tipe dompet tidak valid.");

      const invalidPatchName = await updateWalletRoute(
        jsonRequest(`http://localhost/api/wallets/${walletId}`, "PATCH", {
          name: 999,
        }),
        { params: Promise.resolve({ id: walletId }) }
      );
      expect(invalidPatchName.status).toBe(400);
      expect(
        ((await invalidPatchName.json()) as { error: string }).error
      ).toBe("Nama dompet harus berupa teks.");

      // Archive then unarchive via PATCH /api/wallets/[id] & verify GET /api/wallets
      const archivedRes = await updateWalletRoute(
        jsonRequest(`http://localhost/api/wallets/${walletId}`, "PATCH", {
          archived: true,
        }),
        { params: Promise.resolve({ id: walletId }) }
      );
      expect(archivedRes.status).toBe(200);

      const listActiveRes = await listWalletsRoute(
        new Request("http://localhost/api/wallets")
      );
      expect(listActiveRes.status).toBe(200);
      const activeList = (
        (await listActiveRes.json()) as { wallets: Array<{ id: string }> }
      ).wallets;
      expect(activeList.some((w) => w.id === walletId)).toBe(false);

      const listAllRes = await listWalletsRoute(
        new Request("http://localhost/api/wallets?includeArchived=true")
      );
      expect(listAllRes.status).toBe(200);
      const allList = (
        (await listAllRes.json()) as { wallets: Array<{ id: string }> }
      ).wallets;
      expect(allList.some((w) => w.id === walletId)).toBe(true);

      await updateWalletRoute(
        jsonRequest(`http://localhost/api/wallets/${walletId}`, "PATCH", {
          archived: false,
        }),
        { params: Promise.resolve({ id: walletId }) }
      );

      // Invalid enum & non-string email on POST /api/wallets/[id]/invites
      const invalidInviteRole = await createWalletInviteRoute(
        jsonRequest(
          `http://localhost/api/wallets/${walletId}/invites`,
          "POST",
          { role: "owner" }
        ),
        { params: Promise.resolve({ id: walletId }) }
      );
      expect(invalidInviteRole.status).toBe(400);
      expect(
        ((await invalidInviteRole.json()) as { error: string }).error
      ).toBe("Peran undangan harus editor atau viewer.");

      const missingInviteRole = await createWalletInviteRoute(
        jsonRequest(
          `http://localhost/api/wallets/${walletId}/invites`,
          "POST",
          {}
        ),
        { params: Promise.resolve({ id: walletId }) }
      );
      expect(missingInviteRole.status).toBe(400);
      expect(
        ((await missingInviteRole.json()) as { error: string }).error
      ).toBe("Peran undangan wajib dipilih.");

      const nonStringEmailNum = await createWalletInviteRoute(
        jsonRequest(
          `http://localhost/api/wallets/${walletId}/invites`,
          "POST",
          { email: 123, role: "editor" }
        ),
        { params: Promise.resolve({ id: walletId }) }
      );
      expect(nonStringEmailNum.status).toBe(400);
      expect(
        ((await nonStringEmailNum.json()) as { error: string }).error
      ).toBe("Email harus berupa teks.");

      const nonStringEmailObj = await createWalletInviteRoute(
        jsonRequest(
          `http://localhost/api/wallets/${walletId}/invites`,
          "POST",
          { email: {}, role: "editor" }
        ),
        { params: Promise.resolve({ id: walletId }) }
      );
      expect(nonStringEmailObj.status).toBe(400);
      expect(
        ((await nonStringEmailObj.json()) as { error: string }).error
      ).toBe("Email harus berupa teks.");

      // Top-level non-object JSON & MAX_SAFE_INTEGER initialBalance -> Indonesian 400
      for (const res of [
        await createWalletRoute(
          jsonRequest("http://localhost/api/wallets", "POST", [])
        ),
        await updateWalletRoute(
          jsonRequest(`http://localhost/api/wallets/${walletId}`, "PATCH", []),
          { params: Promise.resolve({ id: walletId }) }
        ),
        await createWalletInviteRoute(
          jsonRequest(
            `http://localhost/api/wallets/${walletId}/invites`,
            "POST",
            []
          ),
          { params: Promise.resolve({ id: walletId }) }
        ),
      ]) {
        expect(res.status).toBe(400);
        expect(((await res.json()) as { error: string }).error).toBe(
          "Format data permintaan tidak valid."
        );
      }

      const hugeBalanceRes = await createWalletRoute(
        jsonRequest("http://localhost/api/wallets", "POST", {
          name: "Terlalu Besar",
          type: "cash",
          initialBalance: Number.MAX_SAFE_INTEGER + 1,
        })
      );
      expect(hugeBalanceRes.status).toBe(400);

      // Whitespace-only email normalizes to null on POST /api/wallets/[id]/invites -> 201
      const whitespaceInviteRes = await createWalletInviteRoute(
        jsonRequest(
          `http://localhost/api/wallets/${walletId}/invites`,
          "POST",
          { email: "   ", role: "viewer" }
        ),
        { params: Promise.resolve({ id: walletId }) }
      );
      expect(whitespaceInviteRes.status).toBe(201);
      const whitespaceInviteJson = (await whitespaceInviteRes.json()) as {
        invite: { email: string | null };
      };
      expect(whitespaceInviteJson.invite.email).toBeNull();

      // Email-targeted invite via POST /api/wallets/[id]/invites -> 201
      const targetedInviteRes = await createWalletInviteRoute(
        jsonRequest(
          `http://localhost/api/wallets/${walletId}/invites`,
          "POST",
          { email: partner.user.email, role: "editor" }
        ),
        { params: Promise.resolve({ id: walletId }) }
      );
      expect(targetedInviteRes.status).toBe(201);
      const targetedToken = (
        (await targetedInviteRes.json()) as { invite: { token: string } }
      ).invite.token;

      const walletInvitesRes = await listWalletInvitesRoute(
        new Request(`http://localhost/api/wallets/${walletId}/invites`),
        { params: Promise.resolve({ id: walletId }) }
      );
      expect(walletInvitesRes.status).toBe(200);
      expect(
        ((await walletInvitesRes.json()) as { invites: unknown[] }).invites
      ).toHaveLength(2);

      // Partner checks GET /api/invites, accepts via POST /api/invites/[token]/accept, and reuse returns 410
      mockSessionCookie = partner.token;
      const myInvitesRes = await listMyInvitesRoute();
      expect(myInvitesRes.status).toBe(200);
      const myInvites = (
        (await myInvitesRes.json()) as { invites: Array<{ token: string }> }
      ).invites;
      expect(myInvites).toHaveLength(1);
      expect(myInvites[0].token).toBe(targetedToken);

      const acceptRes = await acceptInviteRoute(
        new Request(`http://localhost/api/invites/${targetedToken}/accept`, {
          method: "POST",
        }),
        { params: Promise.resolve({ token: targetedToken }) }
      );
      expect(acceptRes.status).toBe(200);
      expect(await acceptRes.json()).toEqual({
        walletId,
        walletName: "Rekening Bersama",
        role: "editor",
      });

      const reuseRes = await acceptInviteRoute(
        new Request(`http://localhost/api/invites/${targetedToken}/accept`, {
          method: "POST",
        }),
        { params: Promise.resolve({ token: targetedToken }) }
      );
      expect(reuseRes.status).toBe(410);

      // Owner removes partner via DELETE /api/wallets/[id]/members/[userId]
      mockSessionCookie = owner.token;
      const removeRes = await removeWalletMemberRoute(
        new Request(
          `http://localhost/api/wallets/${walletId}/members/${partner.user.id}`,
          { method: "DELETE" }
        ),
        { params: Promise.resolve({ id: walletId, userId: partner.user.id }) }
      );
      expect(removeRes.status).toBe(200);
      expect(await removeRes.json()).toEqual({ ok: true });
    } finally {
      await closeDb();
      mockSessionCookie = undefined;
      if (prevDbPath === undefined) {
        delete process.env.DATABASE_PATH;
      } else {
        process.env.DATABASE_PATH = prevDbPath;
      }
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore Windows SQLite file lock on temp dir cleanup
      }
    }
  });
});
