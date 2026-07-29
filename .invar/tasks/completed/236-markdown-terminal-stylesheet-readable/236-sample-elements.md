# Invar Markdown Preview

A paragraph of body text that is long enough to wrap at eighty columns and at one hundred twenty columns, so the padding and the wrap behavior of the stylesheet are both visible in one frame grab.

## Tables

| Component | Role | State |
|:----------|:----:|------:|
| Parser | owns syntax | done |
| Preview | owns geometry | done |
| Renderable | paints rows | done |

### Blockquote

> Reading is the new writing. The preview must give body text breathing
> room from the pane edges, and blockquotes must look distinct.

#### Lists

- first item at level one
- second item with a longer body that should wrap and keep its hanging indent aligned under the text
  - nested item at level two
    - nested item at level three
1. ordered item one
2. ordered item two

##### Code

```ts
const stylesheet = MarkdownStylesheet.Class.resolve('heading', 1);
console.log(stylesheet.leftPadding);
```

---

Inline `code spans`, **strong**, *emphasis*, and a [link](https://example.com) close the sweep.
