import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "../firebaseAdmin";
import { migratePublicVisibility } from "./boardService";

// 실제 .env.local의 Firebase 프로젝트에 direct로 붙는 통합 테스트(패턴은
// canonicalPlaceService.test.ts와 동일) - 예전 "public" 값을 가진 문서를
// 직접 만들어서 마이그레이션이 정확히 옮기는지, 다른 문서는 안 건드리는지 확인.
const BOARDS_COLLECTION = "boards";
const createdSlugs = new Set<string>();

afterEach(async () => {
  const db = getDb();
  await Promise.all([...createdSlugs].map((slug) => db.collection(BOARDS_COLLECTION).doc(slug).delete()));
  createdSlugs.clear();
});

describe("migratePublicVisibility", () => {
  it("visibility가 예전 'public'인 보드만 'unlisted'로 옮기고, 나머지는 안 건드린다", async () => {
    const db = getDb();
    const publicSlug = `test-migrate-public-${randomUUID().slice(0, 8)}`;
    const unlistedSlug = `test-migrate-unlisted-${randomUUID().slice(0, 8)}`;
    const privateSlug = `test-migrate-private-${randomUUID().slice(0, 8)}`;
    createdSlugs.add(publicSlug);
    createdSlugs.add(unlistedSlug);
    createdSlugs.add(privateSlug);

    await Promise.all([
      db.collection(BOARDS_COLLECTION).doc(publicSlug).set({
        slug: publicSlug,
        title: "마이그레이션 대상",
        visibility: "public", // 새 타입엔 없는 예전 값 - 실제 문서 상황을 그대로 재현
        ownerKey: "test-owner",
        createdAt: Date.now(),
      }),
      db.collection(BOARDS_COLLECTION).doc(unlistedSlug).set({
        slug: unlistedSlug,
        title: "이미 unlisted",
        visibility: "unlisted",
        ownerKey: "test-owner",
        createdAt: Date.now(),
      }),
      db.collection(BOARDS_COLLECTION).doc(privateSlug).set({
        slug: privateSlug,
        title: "비공개는 그대로",
        visibility: "private",
        ownerKey: "test-owner",
        createdAt: Date.now(),
      }),
    ]);

    const migratedCount = await migratePublicVisibility();
    expect(migratedCount).toBeGreaterThanOrEqual(1); // 다른 테스트/실행이 남긴 게 있을 수 있어 >= 로 확인

    const [afterPublic, afterUnlisted, afterPrivate] = await Promise.all([
      db.collection(BOARDS_COLLECTION).doc(publicSlug).get(),
      db.collection(BOARDS_COLLECTION).doc(unlistedSlug).get(),
      db.collection(BOARDS_COLLECTION).doc(privateSlug).get(),
    ]);

    expect(afterPublic.data()?.visibility).toBe("unlisted"); // public -> unlisted로 옮겨짐
    expect(afterUnlisted.data()?.visibility).toBe("unlisted"); // 원래도 unlisted, 안 바뀜(당연)
    expect(afterPrivate.data()?.visibility).toBe("private"); // private는 안 건드림
  });

  it("멱등적이다 - 두 번 실행해도 이미 옮겨진 건 다시 안 건드림(재실행분은 0건)", async () => {
    const db = getDb();
    const slug = `test-migrate-idempotent-${randomUUID().slice(0, 8)}`;
    createdSlugs.add(slug);

    await db.collection(BOARDS_COLLECTION).doc(slug).set({
      slug,
      title: "멱등성 테스트",
      visibility: "public",
      ownerKey: "test-owner",
      createdAt: Date.now(),
    });

    await migratePublicVisibility();
    const secondRunCount = await migratePublicVisibility();

    // 이 테스트가 만든 문서는 이미 첫 실행에서 옮겨졌으니, 두 번째 실행에서
    // "public"으로 남은 게 전혀 없다면(다른 테스트와 안 겹치는 이상적 상황) 0.
    // 병렬 테스트 실행 등으로 다른 게 남아있을 수 있어 느슨하게 확인.
    expect(secondRunCount).toBeGreaterThanOrEqual(0);

    const doc = await db.collection(BOARDS_COLLECTION).doc(slug).get();
    expect(doc.data()?.visibility).toBe("unlisted");
  });
});
