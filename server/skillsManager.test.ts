import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createProjectSkill } from './skillsManager.ts'

async function withTempProject(fn: (cwd: string) => Promise<void>) {
  const cwd = await mkdtemp(join('C:\\Users\\lenov\\AppData\\Local\\Temp\\opencode\\', 'v3-web-skill-test-'))
  try {
    await fn(cwd)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}

test('createProjectSkill writes a project SKILL.md and returns metadata', async () => {
  await withTempProject(async (cwd) => {
    const skill = await createProjectSkill(cwd, {
      name: 'lesson-planner',
      description: 'Helps create lesson plans and classroom exercises.',
      content: 'Use this skill to structure lesson objectives, activities, and assessments.',
    })

    assert.equal(skill.name, 'lesson-planner')
    assert.equal(skill.enabled, true)
    assert.equal(skill.source, 'project')

    const file = await readFile(join(cwd, '.pi', 'skills', 'lesson-planner', 'SKILL.md'), 'utf8')
    assert.match(file, /^---\nname: lesson-planner\ndescription: Helps create lesson plans and classroom exercises\.\n---\n\n# lesson-planner\n/)
    assert.match(file, /Use this skill to structure lesson objectives, activities, and assessments\./)
  })
})

test('createProjectSkill rejects path traversal names', async () => {
  await withTempProject(async (cwd) => {
    await assert.rejects(
      () => createProjectSkill(cwd, {
        name: '../evil',
        description: 'Bad skill name.',
        content: 'This should not be written.',
      }),
      /Skill name must use only/
    )
  })
})
