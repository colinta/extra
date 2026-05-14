import {type Comment} from '@/formulaParser/types'

export function formatComment(comment: Comment) {
  switch (comment.type) {
    case 'line':
    case 'arrow':
      return comment.delim + comment.comment
    case 'box':
      return comment.comment
    case 'block':
      return '{-' + comment.comment + '-}'
  }
}

export function formatComments(comments: Comment[]) {
  let code = ''
  for (const comment of comments) {
    switch (comment.type) {
      case 'line':
      case 'arrow':
      case 'box':
        code += formatComment(comment) + '\n'
        break
      case 'block':
        code += formatComment(comment)
        break
    }
  }
  return code
}

export function formatLeadingComments(comments: Comment[]) {
  return formatComments(comments)
}

export function formatFollowingComments(comments: Comment[]) {
  let code = ''
  for (const comment of comments) {
    switch (comment.type) {
      case 'line':
      case 'arrow':
        code += ' ' + formatComment(comment) + '\n'
        break
      case 'box':
        code += '\n' + formatComment(comment) + '\n'
        break
      case 'block':
        code += ' ' + formatComment(comment)
        break
    }
  }
  return code
}

export function formatWrappedComments(
  precedingComments: Comment[],
  code: string,
  followingComments: Comment[] = [],
) {
  return (
    formatLeadingComments(precedingComments) + code + formatFollowingComments(followingComments)
  )
}
