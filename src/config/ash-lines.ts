// src/config/ash-lines.ts
// All Ash Ketchum voice line definitions organized by key.
// Each key maps to an array of lines for random variation.
// MP3 files are relative to public/audio/voice/ash/.

export interface AshLine {
  id: string;
  text: string;
  file: string;        // path relative to public/audio/voice/ash/
  category: string;
}

export const ASH_LINES: Record<string, AshLine[]> = {
  // --- Turn calls ---
  turn_owen: [
    { id: 'turn-owen-1', text: "Owen, it's your turn! Let's GO!", file: 'turn-owen-1.mp3', category: 'turn' },
    { id: 'turn-owen-2', text: "Owen! Show me what you got!", file: 'turn-owen-2.mp3', category: 'turn' },
    { id: 'turn-owen-3', text: "Your turn Owen! I believe in you!", file: 'turn-owen-3.mp3', category: 'turn' },
  ],
  turn_kian: [
    { id: 'turn-kian-1', text: "Kian, you're up! Let's GO!", file: 'turn-kian-1.mp3', category: 'turn' },
    { id: 'turn-kian-2', text: "Kian! Show me what you got!", file: 'turn-kian-2.mp3', category: 'turn' },
    { id: 'turn-kian-3', text: "Your turn Kian! Let's do this!", file: 'turn-kian-3.mp3', category: 'turn' },
  ],

  // --- Color prompts (one key per color) ---
  color_red: [
    { id: 'color-red-1', text: "Find the RED one!", file: 'color-red-1.mp3', category: 'color' },
    { id: 'color-red-2', text: "Where's RED? Find red!", file: 'color-red-2.mp3', category: 'color' },
  ],
  color_blue: [
    { id: 'color-blue-1', text: "Find the BLUE one!", file: 'color-blue-1.mp3', category: 'color' },
    { id: 'color-blue-2', text: "Where's BLUE? Find blue!", file: 'color-blue-2.mp3', category: 'color' },
  ],
  color_yellow: [
    { id: 'color-yellow-1', text: "Find the YELLOW one!", file: 'color-yellow-1.mp3', category: 'color' },
    { id: 'color-yellow-2', text: "Where's YELLOW? Find yellow!", file: 'color-yellow-2.mp3', category: 'color' },
  ],
  color_green: [
    { id: 'color-green-1', text: "Find the GREEN one!", file: 'color-green-1.mp3', category: 'color' },
  ],
  color_orange: [
    { id: 'color-orange-1', text: "Find the ORANGE one!", file: 'color-orange-1.mp3', category: 'color' },
  ],
  color_purple: [
    { id: 'color-purple-1', text: "Find the PURPLE one!", file: 'color-purple-1.mp3', category: 'color' },
  ],

  // --- Number prompts ---
  number_1: [{ id: 'num-1', text: "Count to ONE!", file: 'num-1.mp3', category: 'number' }],
  number_2: [{ id: 'num-2', text: "Count to TWO!", file: 'num-2.mp3', category: 'number' }],
  number_3: [{ id: 'num-3', text: "Count to THREE!", file: 'num-3.mp3', category: 'number' }],
  number_4: [{ id: 'num-4', text: "Count to FOUR!", file: 'num-4.mp3', category: 'number' }],
  number_5: [{ id: 'num-5', text: "Count to FIVE!", file: 'num-5.mp3', category: 'number' }],
  number_6: [{ id: 'num-6', text: "Count to SIX!", file: 'num-6.mp3', category: 'number' }],
  number_7: [{ id: 'num-7', text: "Count to SEVEN!", file: 'num-7.mp3', category: 'number' }],

  // --- Shape prompts ---
  shape_circle: [{ id: 'shape-circle', text: "Find the CIRCLE!", file: 'shape-circle.mp3', category: 'shape' }],
  shape_square: [{ id: 'shape-square', text: "Find the SQUARE!", file: 'shape-square.mp3', category: 'shape' }],
  shape_triangle: [{ id: 'shape-triangle', text: "Find the TRIANGLE!", file: 'shape-triangle.mp3', category: 'shape' }],
  shape_star: [{ id: 'shape-star', text: "Find the STAR!", file: 'shape-star.mp3', category: 'shape' }],
  shape_diamond: [{ id: 'shape-diamond', text: "Find the DIAMOND!", file: 'shape-diamond.mp3', category: 'shape' }],
  shape_hexagon: [{ id: 'shape-hexagon', text: "Find the HEXAGON!", file: 'shape-hexagon.mp3', category: 'shape' }],
  shape_heart: [{ id: 'shape-heart-1', text: "Heart! Find the heart!", file: 'shape-heart-1.mp3', category: 'shape' }],
  shape_oval: [{ id: 'shape-oval-1', text: "Oval! Find the oval!", file: 'shape-oval-1.mp3', category: 'shape' }],

  // --- Letter prompts ---
  letter_c: [{ id: 'letter-c', text: "What letter is this? C! C for Charizard!", file: 'letter-c.mp3', category: 'letter' }],
  letter_f: [{ id: 'letter-f', text: "What letter is this? F! F for Fire!", file: 'letter-f.mp3', category: 'letter' }],
  letter_s: [{ id: 'letter-s', text: "What letter is this? S! S for Star!", file: 'letter-s.mp3', category: 'letter' }],
  letter_b: [{ id: 'letter-b', text: "What letter is this? B! B for Blue!", file: 'letter-b.mp3', category: 'letter' }],
  letter_m: [{ id: 'letter-m-1', text: "M! M for Mega!", file: 'letter-m-1.mp3', category: 'letter' }],
  letter_p: [{ id: 'letter-p-1', text: "P! P for Pikachu!", file: 'letter-p-1.mp3', category: 'letter' }],
  letter_t: [{ id: 'letter-t-1', text: "T! T for Thunder!", file: 'letter-t-1.mp3', category: 'letter' }],
  letter_r: [{ id: 'letter-r-1', text: "R! R for Raichu!", file: 'letter-r-1.mp3', category: 'letter' }],
  letter_d: [{ id: 'letter-d-1', text: "D! D for Dragon!", file: 'letter-d-1.mp3', category: 'letter' }],
  letter_a: [{ id: 'letter-a-1', text: "A! A for Ash!", file: 'letter-a-1.mp3', category: 'letter' }],

  // --- Phonics sounds ---
  phonics_c: [{ id: 'phonics-c', text: "What sound does C make? Cuh!", file: 'phonics-c.mp3', category: 'letter' }],
  phonics_f: [{ id: 'phonics-f', text: "What sound does F make? Fff!", file: 'phonics-f.mp3', category: 'letter' }],
  phonics_s: [{ id: 'phonics-s', text: "What sound does S make? Sss!", file: 'phonics-s.mp3', category: 'letter' }],
  phonics_b: [{ id: 'phonics-b', text: "What sound does B make? Buh!", file: 'phonics-b.mp3', category: 'letter' }],
  phonics_m: [{ id: 'phonics-m-1', text: "Mmm! Like Mega!", file: 'phonics-m-1.mp3', category: 'letter' }],
  phonics_p: [{ id: 'phonics-p-1', text: "Puh! Like Pikachu!", file: 'phonics-p-1.mp3', category: 'letter' }],
  phonics_t: [{ id: 'phonics-t-1', text: "Tuh! Like Thunder!", file: 'phonics-t-1.mp3', category: 'letter' }],
  phonics_r: [{ id: 'phonics-r-1', text: "Rrr! Like Raichu!", file: 'phonics-r-1.mp3', category: 'letter' }],
  phonics_d: [{ id: 'phonics-d-1', text: "Duh! Like Dragon!", file: 'phonics-d-1.mp3', category: 'letter' }],
  phonics_a: [{ id: 'phonics-a-1', text: "Ahh! Like Ash!", file: 'phonics-a-1.mp3', category: 'letter' }],

  // --- Correct reactions ---
  correct: [
    { id: 'correct-1', text: "YEAH! That's it!", file: 'correct-1.mp3', category: 'correct' },
    { id: 'correct-2', text: "AWESOME!", file: 'correct-2.mp3', category: 'correct' },
    { id: 'correct-3', text: "You did it!", file: 'correct-3.mp3', category: 'correct' },
    { id: 'correct-4', text: "ALRIGHT!", file: 'correct-4.mp3', category: 'correct' },
    { id: 'correct-5', text: "Amazing work!", file: 'correct-5.mp3', category: 'correct' },
    { id: 'correct-6', text: "That's the one!", file: 'correct-6.mp3', category: 'correct' },
    { id: 'correct-7', text: "INCREDIBLE!", file: 'correct-7.mp3', category: 'correct' },
    { id: 'correct-8', text: "Now THAT'S a trainer!", file: 'correct-8.mp3', category: 'correct' },
  ],

  // --- Wrong redirects ---
  wrong: [
    { id: 'wrong-1', text: "Not quite! Try again!", file: 'wrong-1.mp3', category: 'wrong' },
    { id: 'wrong-2', text: "Almost! Keep looking!", file: 'wrong-2.mp3', category: 'wrong' },
    { id: 'wrong-3', text: "Hmm, not that one!", file: 'wrong-3.mp3', category: 'wrong' },
    { id: 'wrong-4', text: "Try the other one!", file: 'wrong-4.mp3', category: 'wrong' },
  ],

  // --- Evolution ---
  evolution: [
    { id: 'evo-1', text: "Wait... something's happening!", file: 'evo-1.mp3', category: 'evolution' },
    { id: 'evo-2', text: "IT'S EVOLVING!!", file: 'evo-2.mp3', category: 'evolution' },
    { id: 'evo-charmeleon', text: "CHARMELEON!! We're getting stronger!", file: 'evo-charmeleon.mp3', category: 'evolution' },
    { id: 'evo-charizard', text: "CHARIZARD!! I CHOOSE YOU!!", file: 'evo-charizard.mp3', category: 'evolution' },
    { id: 'evo-mega', text: "MEGA EVOLUTION!!! MEGA CHARIZARD X!!!", file: 'evo-mega.mp3', category: 'evolution' },
    { id: 'evo-power', text: "I can feel the power!!", file: 'evo-power.mp3', category: 'evolution' },
  ],

  // --- Encouragement ---
  encourage: [
    { id: 'enc-1', text: "Don't give up!", file: 'enc-1.mp3', category: 'encourage' },
    { id: 'enc-2', text: "I believe in you!", file: 'enc-2.mp3', category: 'encourage' },
    { id: 'enc-3', text: "You can do it!", file: 'enc-3.mp3', category: 'encourage' },
    { id: 'enc-4', text: "We never give up! That's our way!", file: 'enc-4.mp3', category: 'encourage' },
    { id: 'enc-5', text: "Keep trying trainer!", file: 'enc-5.mp3', category: 'encourage' },
  ],

  // --- Iconic ---
  iconic: [
    { id: 'iconic-1', text: "I choose you!", file: 'iconic-1.mp3', category: 'iconic' },
    { id: 'iconic-2', text: "Let's win this together!", file: 'iconic-2.mp3', category: 'iconic' },
    { id: 'iconic-3', text: "This is just the beginning!", file: 'iconic-3.mp3', category: 'iconic' },
    { id: 'iconic-4', text: "We're gonna be the very best!", file: 'iconic-4.mp3', category: 'iconic' },
    { id: 'iconic-5', text: "Let's GO!", file: 'iconic-5.mp3', category: 'iconic' },
  ],

  // --- Timeout ---
  timeout_start: [{ id: 'timeout-start', text: "Charizard needs a rest.", file: 'timeout-start.mp3', category: 'iconic' }],
  timeout_end: [{ id: 'timeout-end', text: "Welcome back trainers! Let's be good this time!", file: 'timeout-end.mp3', category: 'iconic' }],

  // --- Session limit ---
  session_end: [{ id: 'session-end', text: "Great training today!", file: 'session-end.mp3', category: 'iconic' }],
  daily_limit: [{ id: 'daily-limit', text: "Charizard gave it everything today! See you tomorrow!", file: 'daily-limit.mp3', category: 'iconic' }],

  // --- Word building prompts ---
  word_build: [
    { id: 'word-build-1', text: "Let's build a word! You can do it!", file: 'word-build-1.mp3', category: 'word' },
    { id: 'word-build-2', text: "Spelling time! Let's spell it out!", file: 'word-build-2.mp3', category: 'word' },
  ],
  word_complete: [
    { id: 'word-complete-1', text: "You spelled it! Amazing trainer!", file: 'word-complete-1.mp3', category: 'word' },
    { id: 'word-complete-2', text: "YEAH! You can READ that!", file: 'word-complete-2.mp3', category: 'word' },
  ],

  // --- Number bonds prompts ---
  bonds_prompt: [
    { id: 'bonds-1', text: "Number bonds time! What makes the number?", file: 'bonds-1.mp3', category: 'math' },
    { id: 'bonds-2', text: "Can you find the missing part?", file: 'bonds-2.mp3', category: 'math' },
  ],
  bonds_complete: [
    { id: 'bonds-complete-1', text: "That's the bond! You're a math trainer!", file: 'bonds-complete-1.mp3', category: 'math' },
    { id: 'bonds-complete-2', text: "PERFECT! Those numbers go together!", file: 'bonds-complete-2.mp3', category: 'math' },
  ],

  // --- Comparison prompts ---
  compare_more: [
    { id: 'compare-more-1', text: "Which side has MORE?", file: 'compare-more-1.mp3', category: 'math' },
    { id: 'compare-more-2', text: "Look carefully! Which has MORE fireballs?", file: 'compare-more-2.mp3', category: 'math' },
  ],
  compare_less: [
    { id: 'compare-less-1', text: "Which side has LESS?", file: 'compare-less-1.mp3', category: 'math' },
    { id: 'compare-less-2', text: "Which side has FEWER fireballs?", file: 'compare-less-2.mp3', category: 'math' },
  ],
  compare_same: [
    { id: 'compare-same-1', text: "Are they the SAME? Or different?", file: 'compare-same-1.mp3', category: 'math' },
    { id: 'compare-same-2', text: "Hmm! Do both sides match?", file: 'compare-same-2.mp3', category: 'math' },
  ],

  // --- Addition celebration ---
  addition_complete: [
    { id: 'add-complete-1', text: "You added them up! Great math!", file: 'add-complete-1.mp3', category: 'math' },
    { id: 'add-complete-2', text: "AWESOME! You counted them all together!", file: 'add-complete-2.mp3', category: 'math' },
  ],

  // --- Subitizing ---
  subitize_prompt: [
    { id: 'subitize-1', text: "Quick! How many did you see?", file: 'subitize-1.mp3', category: 'math' },
    { id: 'subitize-2', text: "Flash round! How many dots?", file: 'subitize-2.mp3', category: 'math' },
  ],

  // --- Color pattern prompts ---
  color_pattern: [
    { id: 'color-pat-1', text: "What color comes next? Look at the pattern!", file: 'color-pat-1.mp3', category: 'color' },
    { id: 'color-pat-2', text: "Colors in a pattern! What's next?", file: 'color-pat-2.mp3', category: 'color' },
  ],

  // --- Color sorting ---
  color_sort: [
    { id: 'color-sort-1', text: "Find ALL of them! Collect every one!", file: 'color-sort-1.mp3', category: 'color' },
    { id: 'color-sort-2', text: "Sorting time! Find them all!", file: 'color-sort-2.mp3', category: 'color' },
  ],
  color_sort_complete: [
    { id: 'color-sort-done-1', text: "You found them ALL! Great job sorting!", file: 'color-sort-done-1.mp3', category: 'color' },
    { id: 'color-sort-done-2', text: "Every single one! You're a color master!", file: 'color-sort-done-2.mp3', category: 'color' },
  ],

  // --- Shape pattern prompts ---
  shape_pattern: [
    { id: 'shape-pat-1', text: "What shape comes next? See the pattern!", file: 'shape-pat-1.mp3', category: 'shape' },
    { id: 'shape-pat-2', text: "Shape patterns! What's next in line?", file: 'shape-pat-2.mp3', category: 'shape' },
  ],

  // --- Shape-color combo ---
  shape_combo: [
    { id: 'shape-combo-1', text: "Find the right shape AND the right color!", file: 'shape-combo-1.mp3', category: 'shape' },
    { id: 'shape-combo-2', text: "Two things to look for! Shape AND color!", file: 'shape-combo-2.mp3', category: 'shape' },
  ],

  // --- Star milestones ---
  milestone_super: [
    { id: 'mile-super-1', text: "SUPER TRAINER! Five stars! Amazing!", file: 'mile-super-1.mp3', category: 'milestone' },
  ],
  milestone_mega: [
    { id: 'mile-mega-1', text: "MEGA TRAINER! Ten stars! You're incredible!", file: 'mile-mega-1.mp3', category: 'milestone' },
  ],
  milestone_champion: [
    { id: 'mile-champ-1', text: "CHAMPION! Twenty stars! Unstoppable!", file: 'mile-champ-1.mp3', category: 'milestone' },
  ],
  milestone_master: [
    { id: 'mile-master-1', text: "POKEMON MASTER! FIFTY STARS! THE VERY BEST!", file: 'mile-master-1.mp3', category: 'milestone' },
  ],

  // --- Counting encouragement ---
  count_with_me: [
    { id: 'count-1', text: "Count with me! One... two... three!", file: 'count-1.mp3', category: 'math' },
    { id: 'count-2', text: "Let's count them together!", file: 'count-2.mp3', category: 'math' },
  ],

  // --- Finger counting ---
  fingers_prompt: [
    { id: 'fingers-1', text: "Use your fingers! Show me the number!", file: 'fingers-1.mp3', category: 'math' },
    { id: 'fingers-2', text: "Hold up your fingers and count!", file: 'fingers-2.mp3', category: 'math' },
  ],
};
