-- Brings a database from PR #59 to the palimpsests schema. Run once, as one transaction:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migrate-palimpsests.sql
-- (It includes the rename of the status "draft" to "manuscript", and is safe where that is done already.)
BEGIN;

ALTER TABLE text ADD COLUMN description text;
ALTER TABLE paragraph ADD COLUMN public boolean NOT NULL DEFAULT false;

ALTER TABLE text DROP CONSTRAINT text_production_status_check;
UPDATE text SET production_status = 'manuscript' WHERE production_status = 'draft';
ALTER TABLE text ALTER COLUMN production_status SET DEFAULT 'manuscript';
-- a private text is no longer "published": it is circulated
UPDATE text SET production_status = 'circulated' WHERE production_status = 'published' AND visibility = 'private';

-- what was in a public commentary was public: keep each of those comments marked so
UPDATE paragraph p SET public = true
	FROM text_item i JOIN text t ON t.id = i.text_id
	WHERE i.paragraph_id = p.id AND t.type = 'commentary' AND t.visibility = 'public';

-- a commentary's status and visibility follow the text it is on, from the texts commented on outwards
WITH RECURSIVE chain AS (
	SELECT t.id, t.production_status AS status, t.visibility AS vis, 0 AS depth FROM text t WHERE t.commentary_on IS NULL
	UNION ALL
	SELECT c.id,
		CASE WHEN chain.status IN ('published', 'recanted', 'burned') THEN CASE WHEN marked THEN 'published' ELSE 'circulated' END
			ELSE chain.status END,
		CASE WHEN chain.vis = 'public' AND marked THEN 'public' ELSE 'private' END,
		chain.depth + 1
	FROM chain
		JOIN text c ON c.commentary_on = chain.id
		CROSS JOIN LATERAL (SELECT exists (SELECT 1 FROM text_item i JOIN paragraph p ON p.id = i.paragraph_id WHERE i.text_id = c.id AND p.public) AS marked) m
	WHERE chain.depth < 100
)
UPDATE text SET production_status = chain.status, visibility = chain.vis
	FROM chain WHERE chain.id = text.id AND chain.depth > 0;

ALTER TABLE text ADD CONSTRAINT text_production_status_check
	CHECK (production_status in ('idea', 'manuscript', 'under review', 'circulated', 'published', 'recanted', 'burned'));
ALTER TABLE text ADD CONSTRAINT text_status_visibility_check
	CHECK ((production_status <> 'circulated' or visibility = 'private')
		and (production_status not in ('published', 'recanted', 'burned') or visibility = 'public'));

CREATE TABLE text_editor (
	text_id uuid NOT NULL CONSTRAINT text_editor_text_id_text_id_fk REFERENCES text(id) ON DELETE cascade,
	persona_id uuid NOT NULL CONSTRAINT text_editor_persona_id_persona_id_fk REFERENCES persona(id) ON DELETE cascade,
	CONSTRAINT text_editor_text_id_persona_id_pk PRIMARY KEY (text_id, persona_id)
);
CREATE INDEX "text_editor_personaId_idx" ON text_editor (persona_id);

CREATE TABLE renunciation (
	text_id uuid NOT NULL CONSTRAINT renunciation_text_id_text_id_fk REFERENCES text(id) ON DELETE cascade,
	persona_id uuid NOT NULL CONSTRAINT renunciation_persona_id_persona_id_fk REFERENCES persona(id) ON DELETE cascade,
	extreme boolean NOT NULL DEFAULT false,
	position integer NOT NULL,
	created_at timestamp NOT NULL DEFAULT now(),
	CONSTRAINT renunciation_text_id_persona_id_pk PRIMARY KEY (text_id, persona_id)
);
CREATE INDEX "renunciation_personaId_idx" ON renunciation (persona_id);

CREATE TABLE user_group (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	owner_id text NOT NULL CONSTRAINT user_group_owner_id_user_id_fk REFERENCES "user"(id) ON DELETE cascade,
	name text NOT NULL,
	created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX "user_group_ownerId_idx" ON user_group (owner_id);

CREATE TABLE user_group_member (
	group_id uuid NOT NULL CONSTRAINT user_group_member_group_id_user_group_id_fk REFERENCES user_group(id) ON DELETE cascade,
	user_id text NOT NULL CONSTRAINT user_group_member_user_id_user_id_fk REFERENCES "user"(id) ON DELETE cascade,
	CONSTRAINT user_group_member_group_id_user_id_pk PRIMARY KEY (group_id, user_id)
);
CREATE INDEX "user_group_member_userId_idx" ON user_group_member (user_id);

CREATE TABLE text_share (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	text_id uuid NOT NULL CONSTRAINT text_share_text_id_text_id_fk REFERENCES text(id) ON DELETE cascade,
	user_id text CONSTRAINT text_share_user_id_user_id_fk REFERENCES "user"(id) ON DELETE cascade,
	group_id uuid CONSTRAINT text_share_group_id_user_group_id_fk REFERENCES user_group(id) ON DELETE cascade,
	privilege text NOT NULL DEFAULT 'read',
	CONSTRAINT text_share_target_check CHECK ((user_id is null) <> (group_id is null)),
	CONSTRAINT text_share_privilege_check CHECK (privilege in ('read', 'comment'))
);
CREATE UNIQUE INDEX text_share_user_idx ON text_share (text_id, user_id);
CREATE UNIQUE INDEX text_share_group_idx ON text_share (text_id, group_id);
CREATE INDEX "text_share_userId_idx" ON text_share (user_id);
CREATE INDEX "text_share_groupId_idx" ON text_share (group_id);

CREATE TABLE proposal (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	text_id uuid CONSTRAINT proposal_text_id_text_id_fk REFERENCES text(id) ON DELETE cascade,
	persona_id uuid CONSTRAINT proposal_persona_id_persona_id_fk REFERENCES persona(id) ON DELETE cascade,
	action text NOT NULL,
	payload jsonb,
	proposed_by text NOT NULL CONSTRAINT proposal_proposed_by_user_id_fk REFERENCES "user"(id) ON DELETE cascade,
	created_at timestamp NOT NULL DEFAULT now(),
	CONSTRAINT proposal_target_check CHECK (text_id is not null or persona_id is not null)
);
CREATE INDEX "proposal_textId_idx" ON proposal (text_id);
CREATE INDEX "proposal_personaId_idx" ON proposal (persona_id);

CREATE TABLE proposal_consent (
	proposal_id uuid NOT NULL CONSTRAINT proposal_consent_proposal_id_proposal_id_fk REFERENCES proposal(id) ON DELETE cascade,
	user_id text NOT NULL CONSTRAINT proposal_consent_user_id_user_id_fk REFERENCES "user"(id) ON DELETE cascade,
	created_at timestamp NOT NULL DEFAULT now(),
	CONSTRAINT proposal_consent_proposal_id_user_id_pk PRIMARY KEY (proposal_id, user_id)
);

COMMIT;
