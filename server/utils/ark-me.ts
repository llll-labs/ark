import type { useDatabase } from './db'
import { sql } from 'drizzle-orm'
import { queryResultRows } from './db'

type Database = ReturnType<typeof useDatabase>

interface ArkMeAccessRow {
  ark_user: ({ id: string } & Record<string, unknown>) | null
  capabilities: string[] | null
  memberships: Record<string, unknown>[] | null
}

export interface ArkMeAccess {
  arkUser: ({ id: string } & Record<string, unknown>) | null
  capabilities: string[]
  memberships: Record<string, unknown>[]
}

/**
 * Loads the complete Ark-owned `/me` access projection in one database round
 * trip. Session validation and optional tenant extension hydration remain
 * outside this module.
 */
export async function loadArkMeAccess(authUserId: string, db: Database): Promise<ArkMeAccess> {
  const result = await db.execute(sql`
    with recursive
    ark_user as materialized (
      select *
      from ark.users
      where auth_user_id = ${authUserId}
      limit 1
    ),
    root_space as materialized (
      select id, parent_space_id, inherit_access
      from ark.spaces
      where is_default = true and deleted_at is null
      limit 1
    ),
    access_scope as (
      select id, parent_space_id, inherit_access
      from root_space

      union

      select parent.id, parent.parent_space_id, parent.inherit_access
      from ark.spaces parent
      join access_scope child
        on child.inherit_access = true
       and child.parent_space_id = parent.id
      where parent.deleted_at is null
    ),
    memberships as materialized (
      select membership.*
      from ark.memberships membership
      join ark_user on ark_user.id = membership.ark_user_id
    ),
    active_memberships as materialized (
      select * from memberships where status = 'active'
    ),
    assigned_role_ids as (
      select role_id as id
      from active_memberships
      where role_id is not null

      union

      select membership_role.role_id
      from ark.membership_roles membership_role
      join active_memberships
        on active_memberships.id = membership_role.membership_id
      where membership_role.status = 'active'
    ),
    active_roles as (
      select role.id
      from ark.roles role
      join assigned_role_ids on assigned_role_ids.id = role.id
    ),
    matching_grants as (
      select grant_row.action, grant_row.effect
      from ark.grants grant_row
      where grant_row.status = 'active'
        and (
          (
            grant_row.scope_type = 'space'
            and grant_row.scope_id in (select id from access_scope)
          )
          or (
            grant_row.scope_type = 'global'
            and grant_row.scope_id is null
          )
        )
        and (
          grant_row.subject_type = 'anon'
          or (
            grant_row.subject_type = 'authenticated'
            and exists (select 1 from ark_user)
          )
          or (
            grant_row.subject_type = 'ark_user'
            and grant_row.subject_id = (select id from ark_user)
          )
          or (
            grant_row.subject_type = 'role'
            and grant_row.subject_id in (select id from active_roles)
          )
          or (
            grant_row.subject_type = 'membership'
            and grant_row.subject_id in (select id from active_memberships)
          )
        )
    ),
    effective_capabilities as (
      select action
      from matching_grants
      group by action
      having bool_or(effect = 'allow') and not bool_or(effect = 'deny')
    )
    select
      (
        select jsonb_build_object(
          'id', ark_user.id,
          'authUserId', ark_user.auth_user_id,
          'kind', ark_user.kind,
          'handle', ark_user.handle,
          'displayName', ark_user.display_name,
          'avatarFileId', ark_user.avatar_file_id,
          'bio', ark_user.bio,
          'profileJson', ark_user.profile_json,
          'createdAt', ark_user.created_at,
          'updatedAt', ark_user.updated_at,
          'deletedAt', ark_user.deleted_at
        )
        from ark_user
      ) as ark_user,
      coalesce(
        (
          select jsonb_agg(jsonb_build_object(
            'id', membership.id,
            'arkUserId', membership.ark_user_id,
            'scopeType', membership.scope_type,
            'scopeId', membership.scope_id,
            'roleId', membership.role_id,
            'status', membership.status,
            'joinedAt', membership.joined_at,
            'createdAt', membership.created_at,
            'updatedAt', membership.updated_at,
            'deletedAt', membership.deleted_at
          ) order by membership.created_at, membership.id)
          from memberships membership
        ),
        '[]'::jsonb
      ) as memberships,
      coalesce(
        (
          select jsonb_agg(action order by action)
          from effective_capabilities
        ),
        '[]'::jsonb
      ) as capabilities
  `)
  const row = queryResultRows<ArkMeAccessRow>(result as any)[0]

  return {
    arkUser: row?.ark_user ?? null,
    capabilities: row?.capabilities ?? [],
    memberships: row?.memberships ?? [],
  }
}
