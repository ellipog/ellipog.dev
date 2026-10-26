import type { Metadata } from 'next';

import { SCHEMA_STAMP } from '@/lib/core';
import { absoluteUrl, SITE, social } from '@/lib/metadata';

const TITLE = 'Reference';
const DESCRIPTION =
  'Every FTB Quests 1.21.1 field and its Tenet home: tasks, rewards, chapters, dependencies and rewritten commands. The migrator contract.';

export const metadata: Metadata = {
  title: TITLE,
  ...social({ title: `tenet migrator | ${TITLE}`, description: DESCRIPTION, path: '/reference/' }),
};

/*
 * Where this page sits, for a crawler that reads schema.org. Absolute URLs by
 * construction — a relative URL in structured data is a claim about nothing.
 */
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      name: `tenet migrator | ${TITLE}`,
      url: absoluteUrl('/reference/'),
      description: DESCRIPTION,
      isPartOf: { '@type': 'WebSite', name: SITE.title, url: SITE.url },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE.title, item: SITE.url + '/' },
        { '@type': 'ListItem', position: 2, name: TITLE, item: absoluteUrl('/reference/') },
      ],
    },
  ],
};

function Table({ head, rows }: { head: [string, string, string]; rows: Array<[string, string, string]> }) {
  return (
    <div className="refwrap">
      <table className="reftable">
      <thead>
        <tr>
          <th>{head[0]}</th>
          <th>{head[1]}</th>
          <th>{head[2]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([a, b, c]) => (
          <tr key={`${a}-${b}`}>
            <td><code>{a}</code></td>
            <td><code>{b}</code></td>
            <td>{c}</td>
          </tr>
        ))}
      </tbody>
      </table>
    </div>
  );
}

export default function ReferencePage() {
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />
      <section className="hero">
        <p className="eyebrow">the mapping bible, condensed</p>
        <h1>Reference.</h1>
        <p className="sub">
          Every FTB Quests 1.21.1 field below already has a Tenet home: the middle column is what the
          migrator writes. FTB&rsquo;s snake_case becomes Tenet&rsquo;s camelCase, and an absent FTB field
          keeps Tenet&rsquo;s default. Sourced from <span className="mono">tenet/docs/authoring/ftb-mapping.md</span>{' '}
          and the conversion spec — the full texts, not this page, are the contract.
        </p>
      </section>

      <section className="band">
        <div className="band-head"><span className="label">Tasks that map 1:1</span></div>
        <div>
          <Table
            head={['FTB task', 'Tenet type', 'Notes for the tool']}
            rows={[
              ['advancement + criterion', 'tenet:advancement', 'Empty criterion ("", all 54 ATM10 uses) means the whole advancement: emitted without criterion.'],
              ['observation', 'tenet:observation', 'toObserve / timer / observeType; NBT on toObserve is a fuzzy subset match.'],
              ['stat', 'tenet:stat', 'Same two fields, same meaning.'],
              ['forge_energy', 'tenet:energy', 'value + maxInput; absent max_input means unlimited.'],
              ['kill', 'tenet:kill', 'Tag takes precedence over id; NBT fuzzy subset match.'],
              ['location', 'tenet:location', 'Same box; ignore_dim → ignoreDimension.'],
              ['item + match_components', 'tenet:item + match', 'none / fuzzy / strict identical. Unmarked is none in FTB but strict in Tenet, so it is written as none. 1.19/1.20 match_nbt: true is strict, with weak_nbt_match fuzzy, else none. Integers past ±2⁵³−1 force strict to fuzzy.'],
              ['item data components', 'verbatim', 'Passed through structurally, never interpreted; 1b/0b read as booleans.'],
              ['item + only_from_crafting', 'tenet:item + onlyFromCrafting', 'Tenet counts lifetime crafted statistics.'],
              ['item + consume_items', 'tenet:item + consumeItems', 'Absent defers to chapter defaultConsumeItems, then file default.'],
              ['filter stacks', 'tenet:filter', 'Expression verbatim; quest-unanswerable functions become tenet:custom placeholders.'],
              ['item/fluid + task_screen_only', '+ manualOnly', 'Piped task-screen fill is a documented loss; the manual half is kept.'],
              ['checkmark', 'tenet:checkmark', 'Same handshake; author picture wins over the box.'],
              ['gamestage', 'tenet:stage', 'stage + teamStage pair.'],
            ]}
          />
        </div>
      </section>

      <section className="band">
        <div className="band-head"><span className="label">Rewards that map 1:1</span></div>
        <div>
          <Table
            head={['FTB reward', 'Tenet field', 'Notes for the tool']}
            rows={[
              ['auto', 'auto', 'enabled / invisible / no_toast / disabled identical, incl. file default.'],
              ['team_reward', 'team', 'Absent defers to the file default.'],
              ['exclude_from_claim_all', 'excludeFromClaimAll', 'Same flag on every reward.'],
              ['ignore_reward_blocking', 'ignoreRewardBlocking', 'Same flag, on rewards and quests.'],
              ['disable_toast', 'disableToast', 'Quiets the reward-level notice.'],
              ['title (from lang)', 'title', 'The row\u2019s own words; checkmarks read their button from here.'],
              ['icon override', 'icon', 'Item, texture file, atlas region, or entity spawn egg.'],
              ['command + silent', 'tenet:command', 'Placeholders {p} {x}/{y}/{z} {quest} {chapter} {team} carry over.'],
              ['item + only_one', 'tenet:item + onlyOne', 'Checked by item type, ignoring components.'],
              ['toast', 'tenet:toast', 'Literal text or translation key with fallback.'],
              ['currency', 'tenet:currency', 'Amount passes through; the coin belongs to the installed economy.'],
              ['gamestage', 'tenet:stage', 'stage / remove / teamStage triple.'],
              ['choice / random / loot / all_table', 'table modes', 'random excludes empty, loot includes empty_weight, all_table ignores weights, choice never auto-grants.'],
            ]}
          />
        </div>
      </section>

      <section className="band">
        <div className="band-head"><span className="label">Quest · chapter · file</span></div>
        <div>
          <Table
            head={['FTB field', 'Tenet field', 'Notes for the tool']}
            rows={[
              ['require_sequential_tasks', 'sequentialTasks / defaultSequentialTasks', 'Quest flag, chapter default.'],
              ['hide_quest_until_deps_*', 'hideUntilDependencies*', 'Tristate; absent defers to chapter defaults.'],
              ['hide_dependency_lines', 'hideDependencyLines', 'Incoming lines only.'],
              ['hide_dependent_lines', 'hideDependentLines', 'The outgoing half; either silence wins.'],
              ['min_width / default_min_width', 'minWidth / defaultMinWidth', '0–3000, 0 unset.'],
              ['autofocus_id', 'autofocus', 'Quest in this chapter; absent centres the bounding box.'],
              ['icons (custom_icon, entity_face)', 'icon', '.png/.jpg suffix is a file, anything else an atlas region.'],
              ['table use_title / hide_tooltip', 'useTitle / hideTooltip', 'Same pair under Tenet\u2019s names.'],
              ['invisible (+ until_tasks)', 'invisible (+ invisibleUntilTasks)', 'Same pair, same counting rule.'],
              ['tags', 'tags', 'Same list on every object; lowercase-letters-digits-underscores.'],
              ['guide_page', 'guidePage', 'Shown as a Guide: reference; no integration.'],
              ['show_lock_icons', 'showLockIcons', 'Tool writes explicit true unless FTB says false (absent readings diverge).'],
              ['(no FTB field — FTB has no zoom tiers)', 'disableCanvasLod', 'Tool writes explicit true: preserves the always-drawn canvas. Chapter writes explicit false to opt back into tiers.'],
              ['pause_game / disable_gui', 'pauseGame / disableGui', 'Same switches under Tenet\u2019s names.'],
              ['drop_loot_crates / loot_crate_no_drop', 'tool-reported', 'No Tenet home (crates out of scope): manual work.'],
              ['verify_on_load', 'tool-reported', 'A loader flag with no quest-file meaning.'],
            ]}
          />
        </div>
      </section>

      <section className="band">
        <div className="band-head"><span className="label">Dependencies</span></div>
        <div>
          <Table
            head={['FTB field', 'Tenet field', 'Notes for the tool']}
            rows={[
              ['dependencies', 'dependsOn', 'Remapped HEX → slug, order preserved. Gates on task/reward ids lift onto the owning quest and are reported.'],
              ['dependency_requirement', 'prerequisiteMode', 'all/one × completed/started, same four words.'],
              ['min_required_dependencies', 'minRequired', 'Written only above 0; refused above the dependency count.'],
              ['max_completable_dependents', 'maxCompletableDependents', 'Same cap, written only above 0.'],
              ['optional', 'optional', 'Still gates dependants — optional only excuses chapter completion.'],
              ['progression_mode', 'flexibleProgress', 'Quest → chapter → file; flexible anywhere sets the flag.'],
              ['can_repeat', 'repeatable', 'Quest → chapter default_repeatable_quest → false.'],
              ['repeat_cooldown (s)', 'repeatCooldownTicks (×20)', 'Cooldown without repeatable is reported and dropped.'],
              ['dep_control_pts', 'tool-reported', 'Tenet draws its own routes; hand-bent lines are reported.'],
            ]}
          />
        </div>
      </section>

      <section className="band">
        <div className="band-head"><span className="label">Commands rewritten</span></div>
        <div>
          <Table
            head={['FTB Quests command', 'Tenet command', '']}
            rows={[
              ['/ftbquests block_rewards', '/tenet rewards block', 'unblock for the release.'],
              ['/ftbquests complete', '/tenet complete', 'with-dependencies where FTB finished the chain.'],
              ['/ftbquests reset', '/tenet reset', 'with-dependencies where FTB cleared the chain.'],
              ['/ftbquests open_book', '/tenet open_book', 'Quest ids remapped lowercase.'],
              ['/ftbquests reload', '/tenet reload', ''],
              ['/ftbteams teamstage …', '/tenet stage add/remove-team', 'Named by a member\u2019s player id.'],
            ]}
          />
          <div className="refwrap">
            <div className="prose">
              <p><code>editing_mode</code>, <code>locked</code> and the rest have no Tenet home: reported as manual work.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="band-head"><span className="label">Inlined at import</span></div>
        <div className="refwrap">
          <div className="prose">
          <p>
            Visual presets and chapter appearance defaults resolve into explicit quest values — Tenet reads
            the result, never the preset. Geometry: coordinates ×64, sizes ×48 (measured against FTB
            in-game rendering), clamped 16–512 px; collisions nudge +1,+1 deterministically and are reported.
            Ids lowercase (no aliases — Tenet normalises lookup); every locale found ships as a{' '}
            <code>lang/</code> overlay keyed by the new ids.
          </p>
          <p className="muted">
            Tenet schema stamp: <code>{SCHEMA_STAMP.tenetCommit}</code> · vendored {SCHEMA_STAMP.vendored} ·{' '}
            {SCHEMA_STAMP.files.join(', ')}
          </p>
          </div>
        </div>
      </section>
    </main>
  );
}
