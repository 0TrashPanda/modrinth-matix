import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });
const createdAt = () =>
	timestamp('created_at')
		.notNull()
		.default(sql`(unixepoch() * 1000)`);

export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	googleSub: text('google_sub').notNull().unique(),
	email: text('email').notNull(),
	handle: text('handle').notNull().unique(),
	displayName: text('display_name').notNull(),
	avatarUrl: text('avatar_url'),
	role: text('role', { enum: ['user', 'admin'] }).notNull().default('user'),
	inviteQuota: integer('invite_quota').notNull().default(0),
	// Default for lists that follow another list and don't set their own mode.
	followMode: text('follow_mode', { enum: ['auto', 'manual'] }).notNull().default('auto'),
	createdAt: createdAt(),
	disabledAt: timestamp('disabled_at')
});

export const sessions = sqliteTable(
	'sessions',
	{
		// SHA-256 of the cookie token, so a leaked database can't be used to log in.
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: timestamp('expires_at').notNull()
	},
	(table) => [index('sessions_user_idx').on(table.userId)]
);

export const invites = sqliteTable('invites', {
	id: text('id').primaryKey(),
	code: text('code').notNull().unique(),
	createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
	maxUses: integer('max_uses').notNull().default(1),
	uses: integer('uses').notNull().default(0),
	expiresAt: timestamp('expires_at'),
	lockedEmail: text('locked_email'),
	revokedAt: timestamp('revoked_at'),
	createdAt: createdAt()
});

export const inviteUses = sqliteTable('invite_uses', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	inviteId: text('invite_id')
		.notNull()
		.references(() => invites.id, { onDelete: 'cascade' }),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	usedAt: createdAt()
});

export const modlists = sqliteTable(
	'modlists',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		description: text('description').notNull().default(''),
		visibility: text('visibility', { enum: ['private', 'shared', 'public'] })
			.notNull()
			.default('private'),
		loader: text('loader').notNull().default('fabric'),
		includeSnapshots: integer('include_snapshots', { mode: 'boolean' }).notNull().default(false),
		targetGameVersion: text('target_game_version'),
		forkedFrom: text('forked_from'),
		// Set when this list follows another list; its revisions then store overrides.
		baseListId: text('base_list_id'),
		followMode: text('follow_mode', { enum: ['default', 'auto', 'manual'] }).notNull().default('default'),
		// Last base revision the owner has seen. Manual mode uses exactly this revision.
		baseRevision: integer('base_revision'),
		currentRevision: integer('current_revision').notNull().default(0),
		entryCount: integer('entry_count').notNull().default(0),
		createdAt: createdAt(),
		updatedAt: createdAt()
	},
	(table) => [index('modlists_owner_idx').on(table.ownerId), index('modlists_base_idx').on(table.baseListId)]
);

export const modlistShares = sqliteTable(
	'modlist_shares',
	{
		modlistId: text('modlist_id')
			.notNull()
			.references(() => modlists.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		role: text('role', { enum: ['viewer', 'editor'] }).notNull()
	},
	(table) => [primaryKey({ columns: [table.modlistId, table.userId] })]
);

export const revisions = sqliteTable(
	'revisions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		modlistId: text('modlist_id')
			.notNull()
			.references(() => modlists.id, { onDelete: 'cascade' }),
		// 1, 2, 3... per list.
		number: integer('number').notNull(),
		authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
		message: text('message').notNull().default(''),
		// JSON-encoded ListContent.
		content: text('content').notNull(),
		createdAt: createdAt()
	},
	(table) => [uniqueIndex('revisions_list_number_idx').on(table.modlistId, table.number)]
);

export type User = typeof users.$inferSelect;
export type Invite = typeof invites.$inferSelect;
export type Modlist = typeof modlists.$inferSelect;
export type Revision = typeof revisions.$inferSelect;
