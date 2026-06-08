import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDirectoryDialogOutput } from './directoryDialog.ts'

test('parseDirectoryDialogOutput returns the selected Windows path', () => {
  assert.equal(
    parseDirectoryDialogOutput('SELECTED:E:\\EducationalAgent\\v3-web\r\n'),
    'E:\\EducationalAgent\\v3-web'
  )
})

test('parseDirectoryDialogOutput returns null when the dialog is cancelled', () => {
  assert.equal(parseDirectoryDialogOutput('CANCELLED\r\n'), null)
})

test('parseDirectoryDialogOutput rejects unexpected output', () => {
  assert.throws(
    () => parseDirectoryDialogOutput('something else'),
    /Unexpected directory dialog output/
  )
})
