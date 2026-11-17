/**
 * Short built-in text for the sample materials that ship with the demo library. They have no stored
 * file, so the reviewer generator reads this instead. Uploaded materials are read from their real file.
 */
export const SAMPLE_TEXT = {
  '1': `Introduction to Machine Learning

Machine learning is a field of study where computers learn patterns from data instead of following fixed rules. A model improves its predictions as it sees more examples.

Supervised Learning

Supervised learning is learning from labeled training data, where every example has a known answer. For example, a spam filter learns from emails that people already marked as spam or not spam. Classification predicts a category, while regression predicts a number.

Unsupervised Learning

Unsupervised learning finds structure in data that has no labels. Clustering is grouping similar examples together. For instance, a shop can group customers by buying habits without being told the groups first.

Overfitting and Regularization

Overfitting happens when a model memorizes the training data and performs poorly on new data. Regularization is a technique that penalizes model complexity to reduce overfitting. A validation set is held-out data used to check how well a model generalizes. Good models perform well on both training data and new data.`,
  '2': `Automata Theory, Module 03

Finite Automata

A deterministic finite automaton (DFA) is a machine with exactly one transition for each state and input symbol. A DFA reads a string one symbol at a time and accepts it if it ends in an accepting state. For example, a DFA can check whether a binary string has an even number of zeros.

Nondeterministic Automata

A nondeterministic finite automaton (NFA) may have several possible next states for one symbol, or none at all. Every NFA can be converted into an equivalent DFA, although the DFA may need many more states. NFAs are often easier to design than DFAs.

Regular Languages

A regular language is a language that some finite automaton can recognize. Regular expressions describe exactly the regular languages. The pumping lemma is a property that every regular language satisfies, and it is used to prove that some languages are not regular.`,
  '3': `Computer Architecture Notes

Memory Hierarchy

A cache is a small, fast memory that stores recently used data close to the processor. A cache hit happens when the needed data is already in the cache, and a cache miss happens when it is not. The memory hierarchy balances speed, size and cost, with registers at the top and disk at the bottom. Caches work because programs tend to reuse the same data, which is called locality.

Pipelining

Pipelining is overlapping the stages of several instructions to raise throughput. For example, while one instruction is being executed, the next one can already be decoded. A data hazard happens when an instruction needs a result that is not ready yet. A control hazard happens when the processor does not yet know which instruction comes next, such as after a branch. Forwarding is a technique that passes a result directly to the next instruction to reduce stalls.`,
  '4': `Information Assurance Reviewer

The CIA Triad

The CIA triad is the three core goals of security: confidentiality, integrity and availability. Confidentiality means only authorized people can read the data. Integrity means data is not changed without permission. Availability means systems and data can be used when needed.

Access Control

Authentication is verifying who a user or system claims to be. Authorization is deciding what an authenticated user is allowed to do. Least privilege is giving users only the access they need. For example, a student account should not be able to edit grades.

Risk Management

Risk is the chance that a threat will use a weakness and cause harm. A vulnerability is a weakness that a threat can use. Risk management identifies risks, rates them, and chooses controls to reduce them.`,
};
