import * as React from 'react'

import { ILineTokens } from '../../lib/highlighter/types'
import classNames from 'classnames'
import { relativeChanges } from './changed-range'
import { mapKeysEqual } from '../../lib/equality'
import {
  WorkingDirectoryFileChange,
  CommittedFileChange,
} from '../../models/status'

/**
 * DiffRowType defines the different types of
 * rows that a diff visualization can have.
 *
 * It contains similar values than DiffLineType
 * with the addition of `Modified`, which
 * corresponds to a line that has both deleted and
 * added content.
 */
export enum DiffRowType {
  Context = 'Context',
  Hunk = 'Hunk',
  Added = 'Added',
  Deleted = 'Deleted',
  Modified = 'Modified',
}

export interface IDiffRowData {
  /**
   * The actual contents of the diff line.
   */
  readonly content: string
  /**
   * The line number on the source file.
   */
  readonly lineNumber: number
  /**
   * The line number on the diff.
   * This is used for discarding lines
   * and for partial committing lines.
   */
  readonly diffLineNumber: number
  /**
   * Flag to display that this diff line lacks a new line.
   * This is used to display when a newline is
   * added or removed to the last line of a file.
   */
  readonly noNewLineIndicator: boolean
  /**
   * Whether the diff line has been selected for partial committing.
   */
  readonly isSelected: boolean
}

/**
 * IDiffRowAdded represents a row that displays an added line.
 */
interface IDiffRowAdded {
  readonly type: DiffRowType.Added
  /**
   * The data object contains information about that added line in the diff.
   */
  readonly data: IDiffRowData
  /**
   * The start line of the hunk where this line belongs in the diff.
   *
   * In this context, a hunk is not exactly equivalent to a diff hunk, but
   * instead marks a group of consecutive added/deleted lines (see hoveredHunk
   * comment in the `<SideBySide />` component).
   */
  readonly hunkStartLine: number
}

/**
 * IDiffRowDeleted represents a row that displays a deleted line.
 */
interface IDiffRowDeleted {
  readonly type: DiffRowType.Deleted
  /**
   * The data object contains information about that deleted line in the diff.
   */
  readonly data: IDiffRowData
  /**
   * The start line of the hunk where this line belongs in the diff.
   *
   * In this context, a hunk is not exactly equivalent to a diff hunk, but
   * instead marks a group of consecutive added/deleted lines (see hoveredHunk
   * comment in the `<SideBySide />` component).
   */
  readonly hunkStartLine: number
}

/**
 * IDiffRowModified represents a row that displays both a deleted line inline
 * with an added line.
 */
interface IDiffRowModified {
  readonly type: DiffRowType.Modified
  /**
   * The beforeData object contains information about the deleted line in the diff.
   */
  readonly beforeData: IDiffRowData
  /**
   * The beforeData object contains information about the added line in the diff.
   */
  readonly afterData: IDiffRowData
  /**
   * Flag to indicate whether we can highlight the differences between the
   * deleted and the added line as part of syntax highlighting.
   */
  readonly displayDiffTokens: boolean
  /**
   * The start line of the hunk where this line belongs in the diff.
   *
   * In this context, a hunk is not exactly equivalent to a diff hunk, but
   * instead marks a group of consecutive added/deleted lines (see hoveredHunk
   * comment in the `<SideBySide />` component).
   */
  readonly hunkStartLine: number
}

/**
 * IDiffRowContext represents a row that contains non-modified
 * contextual lines around additions/deletions in a diff.
 */
interface IDiffRowContext {
  readonly type: DiffRowType.Context
  /**
   * The actual contents of the contextual line.
   */
  readonly content: string
  /**
   * The line number of this row in the previous state source file.
   */
  readonly beforeLineNumber: number
  /**
   * The line number of this row in the next state source file.
   */
  readonly afterLineNumber: number
}

/**
 * IDiffRowContext represents a row that contains the header
 * of a diff hunk.
 */
interface IDiffRowHunk {
  readonly type: DiffRowType.Hunk
  /**
   * The actual contents of the line.
   */
  readonly content: string
}

export type DiffRow =
  | IDiffRowAdded
  | IDiffRowDeleted
  | IDiffRowModified
  | IDiffRowContext
  | IDiffRowHunk

export type ChangedFile = WorkingDirectoryFileChange | CommittedFileChange

/**
 * Returns an object with two ILineTokens objects that can be used to highlight
 * the added and removed characters between two lines.
 *
 * The `before` object contains the tokens to be used against the `lineBefore` string
 * while the `after` object contains the tokens to use with the `lineAfter` string.
 *
 * This method can be used in conjunction with the `syntaxHighlightLine()` method to
 * get the difference between two lines highlighted:
 *
 * syntaxHighlightLine(
 *   lineBefore,
 *   getDiffTokens(lineBefore, lineAfter).before
 * )
 *
 * @param lineBefore    The first version of the line to compare.
 * @param lineAfter     The second version of the line to compare.
 */
export function getDiffTokens(
  lineBefore: string,
  lineAfter: string
): { before: ILineTokens; after: ILineTokens } {
  const changeRanges = relativeChanges(lineBefore, lineAfter)

  return {
    before: {
      [changeRanges.stringARange.location]: {
        token: 'diff-delete-inner',
        length: changeRanges.stringARange.length,
      },
    },
    after: {
      [changeRanges.stringBRange.location]: {
        token: 'diff-add-inner',
        length: changeRanges.stringBRange.length,
      },
    },
  }
}

/**
 * Returns an JSX element with syntax highlighting of the passed line using both
 * the syntaxTokens and diffTokens.
 *
 * @param line          The line to syntax highlight.
 * @param tokensArray   An array of ILineTokens objects that is used for syntax highlighting.
 */
export function syntaxHighlightLine(
  line: string,
  ...tokensArray: ReadonlyArray<ILineTokens | null>
): JSX.Element {
  const elements = []
  let currentElement = {
    content: '',
    tokens: new Map<string, number>(),
  }

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const newTokens = new Map<string, number>()

    for (const [token, endPosition] of currentElement.tokens) {
      if (endPosition > i) {
        newTokens.set(token, endPosition)
      }
    }

    for (const tokens of tokensArray) {
      if (tokens !== null && tokens[i] !== undefined && tokens[i].length > 0) {
        // ILineTokens can contain multiple tokens separated by spaces.
        // We split them to avoid creating unneeded HTML elements when
        // these tokens do not maintain the same order.
        const tokenNames = tokens[i].token.split(' ')
        const position = i + tokens[i].length

        for (const name of tokenNames) {
          const existingTokenPosition = newTokens.get(name)

          // While it's rare, it's theoretically possible that the same
          // token exists for the same start position with different end
          // positions. If this happens, we choose the longest one.
          if (
            existingTokenPosition === undefined ||
            position > existingTokenPosition
          ) {
            newTokens.set(name, position)
          }
        }
      }
    }

    // If the calculated tokens for the character
    // are the same as the ones for the current element,
    // we can just append the character on that element contents.
    // Otherwise, we need to create a new element with the tokens
    // and "archive" the current element.
    if (mapKeysEqual(currentElement.tokens, newTokens)) {
      currentElement.content += char
      currentElement.tokens = newTokens
    } else {
      elements.push({
        tokens: currentElement.tokens,
        content: currentElement.content,
      })

      currentElement = {
        content: char,
        tokens: newTokens,
      }
    }
  }

  // Add the remaining current element to the list of elements.
  elements.push({
    tokens: currentElement.tokens,
    content: currentElement.content,
  })

  return (
    <>
      {elements.map((element, i) => {
        if (element.tokens.size === 0) {
          // If the element does not contain any token
          // we can skip creating a span.
          return element.content
        }
        return (
          <span
            key={i}
            className={classNames(
              [...element.tokens.keys()].map(name => `cm-${name}`)
            )}
          >
            {element.content}
          </span>
        )
      })}
    </>
  )
}

/** Utility function for checking whether a file supports selection */
export function canSelect(
  file: ChangedFile
): file is WorkingDirectoryFileChange {
  return file instanceof WorkingDirectoryFileChange
}
