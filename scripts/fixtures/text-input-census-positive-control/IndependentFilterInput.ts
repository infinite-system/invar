// This known-bad fixture proves that the text-input census rejects a class which owns both
// one-line query state and editing behavior instead of composing TextInputModel.
import { ref } from 'vue';

class $IndependentFilterInput {
  get query() {
    return ref('');
  }

  insert(text: string): void {
    this.query.value += text;
  }
}

void $IndependentFilterInput;
