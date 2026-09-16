BEGIN ISOLATION LEVEL SERIALIZABLE;
DO $resume$
DECLARE
  g qa."Game"%ROWTYPE;
  j qa."GenerationJob"%ROWTYPE;
  c qa."ChildProfile"%ROWTYPE;
  l qa."WorldBudgetLedger"%ROWTYPE;
  receipt jsonb;
  evidence jsonb;
BEGIN
  SELECT * INTO STRICT g FROM qa."Game" WHERE id='game_ras96hxkd7s3dvth209h' FOR UPDATE;
  SELECT * INTO STRICT j FROM qa."GenerationJob" WHERE id='job_game_ras96hxkd7s3dvth209h' FOR UPDATE;
  SELECT * INTO STRICT c FROM qa."ChildProfile" WHERE id=g."childProfileId" FOR UPDATE;
  SELECT * INTO STRICT l FROM qa."WorldBudgetLedger" WHERE "worldId"=g.id||':board-wizard' FOR UPDATE;
  PERFORM 1 FROM qa."Order" WHERE "gameId"=g.id FOR UPDATE;
  PERFORM 1 FROM qa."Asset" a JOIN qa."FileBlob" f ON f.key=a."storagePath"
    WHERE a.id IN (c."identityAssetId",c."avatarAssetId",c."originalPhotoAssetId") FOR UPDATE OF a,f;
  IF g.status<>'MANUAL_REVIEW' OR g."styleVersion"<>'local-patch-world-v1' OR g."deletedAt" IS NOT NULL
    OR g."configJson" IS NOT NULL OR g."ownerId"<>'usr_2jy3z93kwtzg46qk70ta'
    OR g."updatedAt"<>timestamp '2026-09-16 11:41:34.035'
    OR g."lastError"<>'board-wizard: identity-style-review-required; retained evidence requires reconciliation; no automatic repurchase'
    THEN RAISE EXCEPTION 'Game changed; no resume'; END IF;
  IF j."gameId"<>g.id OR j.status<>'DONE' OR j.attempts<>1 OR j."currentStep" IS NOT NULL
    OR j."updatedAt"<>timestamp '2026-09-16 10:52:35.354'
    OR j."lastError"<>'board-wizard: identity-style-review-required'
    OR j."stepsJson"::jsonb->'boardWizardIdentity'->>'reason'<>'identity-style-review-required'
    OR j."stepsJson"::jsonb ? 'identityBestOfTwo'
    OR (SELECT count(*) FROM qa."GenerationJob" WHERE "gameId"=g.id)<>1
    THEN RAISE EXCEPTION 'Job changed; no resume'; END IF;
  IF c.id<>'chl_14ohxau1lj2qojeo7ax1' OR c."ownerId"<>g."ownerId" OR c."deletedAt" IS NOT NULL OR c."ageYears"<>5
    OR c."identityAssetId"<>'ast_0gvljgmqfsl5aevsp3vm' OR c."avatarAssetId"<>'ast_z4rvb4aahcddtbafjv5g'
    OR c."originalPhotoAssetId"<>'ast_jszl9q6s48kitlblfsz0'
    THEN RAISE EXCEPTION 'Child references changed; no resume'; END IF;
  IF l.revision<>3 OR md5(l."snapshotJson")<>'2a244b07844a97cf4a8ee7d876965674'
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(l."snapshotJson"::jsonb->'requests') r
      WHERE r->>'state'<>'settled' OR r->'conflicts'<>'[]'::jsonb OR r->'unknownReasons'<>'[]'::jsonb)
    THEN RAISE EXCEPTION 'Billing changed or unresolved; no resume'; END IF;
  IF NOT EXISTS (SELECT 1 FROM qa."Order" WHERE id='ord_m3k6gsodczodu2lv6ssl' AND "gameId"=g.id
      AND "paymentStatus"='PAID' AND "paidAt" IS NOT NULL AND "refundedAt" IS NULL)
    OR EXISTS (SELECT 1 FROM qa."Order" WHERE "gameId"=g.id AND ("paymentStatus"='REFUNDED' OR "refundedAt" IS NOT NULL))
    THEN RAISE EXCEPTION 'Order not eligible'; END IF;
  IF (SELECT count(*) FROM qa."GameScene" WHERE "gameId"=g.id AND "sceneVersion"=9)<>9
    OR (SELECT count(*) FROM qa."GameScene" WHERE "gameId"=g.id)<>9
    OR EXISTS (SELECT 1 FROM qa."TargetInstance" t JOIN qa."GameScene" s ON s.id=t."gameSceneId" WHERE s."gameId"=g.id)
    THEN RAISE EXCEPTION 'Not a pre-hide catalog9 job'; END IF;
  IF (SELECT count(*) FROM qa."Asset" a JOIN qa."FileBlob" f ON f.key=a."storagePath"
      WHERE a.id IN (c."identityAssetId",c."avatarAssetId",c."originalPhotoAssetId")
      AND a.status='READY' AND a."deletedAt" IS NULL AND a."ownerId"=g."ownerId"
      AND a.bytes=octet_length(f.data)
      AND encode(sha256(f.data),'hex')=CASE a.id
        WHEN 'ast_0gvljgmqfsl5aevsp3vm' THEN '0b6b551de1ddcd5815979b3c68929614245f17339aace84b4fab68fd5416d779'
        WHEN 'ast_z4rvb4aahcddtbafjv5g' THEN 'd791ba2d5ec3f15b995af8f2795045102c47fdf1861b61b49a185ebf3945c8e9'
        WHEN 'ast_jszl9q6s48kitlblfsz0' THEN 'c9e06dc12d96bb70f7cdb824372601423c6e6138620143efe9f4fd1ad4173968' END)<>3
    THEN RAISE EXCEPTION 'Asset bytes changed or missing'; END IF;
  SELECT "metaJson"::jsonb INTO STRICT receipt FROM qa."AuditLog"
    WHERE id='aud_dmdrnjtniiy5wrvqt2kl' AND action='board-wizard:identity-style-reviewed' AND "entityId"=c."identityAssetId";
  IF receipt->>'fingerprint'<>'a2f576d08efacaa6c0f07f92f1dc062bbe7298c46ff76e44cc0604eef84fb9ba'
    OR receipt->>'version'<>'board-wizard-identity-style-luna-low-age/v4'
    OR receipt->'checks'->>'sheetLayout'<>'pass' OR receipt->'checks'->>'identity'<>'uncertain'
    OR receipt->'checks'->>'age'<>'fail' OR receipt->'provenance'->'crop' IS DISTINCT FROM c."photoCropJson"::jsonb
    OR receipt->'automaticSelection' IS NOT NULL
    THEN RAISE EXCEPTION 'Review changed or not subjective-only eligible'; END IF;
  evidence := jsonb_build_object('policy','identity-best-of-two/v1','authorizedBy','explicit user request: resume',
    'deployment','dpl_GGFR8TAH6PNW3anU6vbKLZS8fxF6','runtimeCommit','b6b1a0bf',
    'previousGameStatus',g.status,'previousGameError',g."lastError",
    'previousJobStatus',j.status,'previousJobError',j."lastError",'previousSteps',j."stepsJson"::jsonb,
    'retainedIdentityAssetId',c."identityAssetId",'reviewFingerprint',receipt->>'fingerprint',
    'ledgerRevision',l.revision,'ledgerMd5',md5(l."snapshotJson"),
    'newApprovalInvented',false,'billingReset',false,'maximumAdditionalIdentityRenders',1);
  INSERT INTO qa."AuditLog"(id,"actorType",action,"entityType","entityId","metaJson","createdAt")
    VALUES ('aud_identityresume_arbel_20260916','SYSTEM','identity-best-of-two:resume','Game',g.id,evidence::text,now());
  UPDATE qa."GenerationJob" SET status='QUEUED',"currentStep"=NULL,"lastError"=NULL,
    "stepsJson"=(j."stepsJson"::jsonb-'boardWizardIdentity')::text,"updatedAt"=now() WHERE id=j.id;
  UPDATE qa."Game" SET status='AVATAR_GENERATING',"lastError"=NULL,"updatedAt"=now() WHERE id=g.id;
END $resume$;
COMMIT;
SELECT g.id,g.status,j.status AS job_status,j.attempts,j."currentStep",
  (SELECT revision FROM qa."WorldBudgetLedger" WHERE "worldId"=g.id||':board-wizard') AS ledger_revision
FROM qa."Game" g JOIN qa."GenerationJob" j ON j."gameId"=g.id WHERE g.id='game_ras96hxkd7s3dvth209h';
