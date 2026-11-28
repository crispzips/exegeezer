// For the seed scripts, which write rows directly: bring every commentary's status and visibility in line with the text
// it is on (the app does this itself, in src/lib/server/commentaries.js). One its authors have repressed stays so.

/** @param {import('postgres').Sql} sql */
export async function settleCommentaries(sql) {
	await sql.unsafe(`WITH RECURSIVE chain AS (
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
	FROM chain WHERE chain.id = text.id AND chain.depth > 0 AND text.production_status NOT IN ('recanted', 'burned')`);
}
