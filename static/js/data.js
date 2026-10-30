// All page data lives here so results and video paths can be edited in one place.
// A media slot whose video file is missing renders as a labeled placeholder.

window.SPECTRA = {};

// ---------------------------------------------------------------------------
// "When did it go wrong" — Fig. 3 rollouts.
// TODO: replace `cost` with the exported c(t) of these rollouts. The points
// below are traced by eye from Fig. 3; Q_path is rescaled to hit the final Q.
// `video` is synced to progress linearly once the file exists.
// ---------------------------------------------------------------------------
SPECTRA.traces = {
  place_sphere: {
    title: 'PlaceSphere',
    finalQ: 0.65,
    phases: ['reach', 'grasp', 'carry', 'release'],
    video: 'static/videos/rollouts/place_sphere.mp4',
    keys: [
      { p: 0.755, img: 'static/images/keyframes/place_sphere_1.jpg', label: 'Sphere placed' },
      { p: 0.835, img: 'static/images/keyframes/place_sphere_2.jpg', label: 'Re-grasp drags the bin' },
      { p: 0.910, img: 'static/images/keyframes/place_sphere_3.jpg', label: 'Bin dragged further' },
    ],
    cost: [[0, 0], [0.70, 0], [0.73, 0.15], [0.755, 0.5], [0.775, 0.3], [0.80, 0.4], [0.815, 1.1],
           [0.835, 1.5], [0.85, 0.65], [0.875, 0.6], [0.89, 0.8], [0.91, 1.25], [0.93, 1.0],
           [0.95, 1.1], [0.965, 1.9], [0.985, 2.25], [1.0, 2.0]],
  },
  peg_insertion: {
    title: 'PegInsertion',
    finalQ: 0.88,
    phases: ['reach', 'grasp', 'align', 'insert'],
    video: 'static/videos/rollouts/peg_insertion.mp4',
    keys: [
      { p: 0.645, img: 'static/images/keyframes/peg_insertion_1.jpg', label: 'Peg at the box' },
      { p: 0.735, img: 'static/images/keyframes/peg_insertion_2.jpg', label: 'Misses hole, peg pushed against box' },
      { p: 0.875, img: 'static/images/keyframes/peg_insertion_3.jpg', label: 'Inserted, still shifted' },
    ],
    cost: [[0, 0], [0.24, 0], [0.30, 0.08], [0.60, 0.1], [0.645, 0.15], [0.67, 0.5], [0.70, 0.6],
           [0.72, 0.7], [0.735, 0.95], [0.75, 0.55], [0.77, 0.4], [0.82, 0.4], [0.85, 0.7],
           [0.875, 0.85], [0.90, 0.8], [0.93, 0.5], [0.96, 0.4], [1.0, 0.42]],
  },
};

// ---------------------------------------------------------------------------
// Table I — mean Q under controlled deviations.
// ---------------------------------------------------------------------------
SPECTRA.deviation = {
  levels: ['clean', '5°', '10°', '25°', '45°'],
  // video: one clip per task and level; {deg} is replaced by clean/5/10/25/45
  video: 'static/videos/deviation/{task}_{deg}.mp4',
  tasks: [
    { id: 'PlaceCan',     axis: 'tilt', q: [0.99, 0.97, 0.94, 0.82, 0.65], rho: -0.98 },
    { id: 'CloseDrawer',  axis: 'tilt', q: [1.00, 0.88, 0.81, 0.58, 0.42], rho: -0.97 },
    { id: 'PlugCharger',  axis: 'roll', q: [0.99, 0.98, 0.94, 0.84, 0.76], rho: -0.94 },
    { id: 'PegInsertion', axis: 'roll', q: [0.99, 0.95, 0.90, 0.71, 0.56], rho: -0.94 },
    { id: 'StackCube',    axis: 'tilt', q: [0.99, 0.99, 0.98, 0.90, 0.75], rho: -0.88 },
    { id: 'PokeCube',     axis: 'roll', q: [1.00, 0.98, 0.97, 0.91, 0.81], rho: -0.84 },
    { id: 'PlaceSphere',  axis: 'tilt', q: [0.99, 0.99, 0.99, 0.98, 0.92], rho: -0.74 },
  ],
};

// ---------------------------------------------------------------------------
// Table III — Spearman correlation with mean human ratings.
// null = metric not compared on that subset; NaN = undefined (constant score).
// ---------------------------------------------------------------------------
SPECTRA.human = {
  metrics: [
    { id: 'Q',    label: 'Q (Ours)' },
    { id: 'qwen', label: 'Qwen3-VL' },
    { id: 'sqs',  label: 'SQS (PRM-as-a-Judge)' },
    { id: 'P',    label: '−Path length' },
    { id: 'J',    label: '−Jerk' },
  ],
  all: {
    n: 105,
    rows: {
      Overall:      { Q: 0.81, qwen: 0.28, sqs: 0.50 },
      CloseDrawer:  { Q: 0.37, qwen: 0.25, sqs: 0.16 },
      PlaceCan:     { Q: 0.71, qwen: 0.44, sqs: 0.20 },
      PlaceSphere:  { Q: 0.90, qwen: 0.37, sqs: 0.79 },
      PokeCube:     { Q: 0.81, qwen: 0.22, sqs: 0.31 },
      StackCube:    { Q: 0.64, qwen: 0.56, sqs: 0.42 },
      PlugCharger:  { Q: 0.93, qwen: 0.12, sqs: 0.43 },
      PegInsertion: { Q: 0.85, qwen: 0.40, sqs: 0.74 },
    },
  },
  succ: {
    n: 81,
    rows: {
      Overall:      { Q: 0.61, qwen: 0.05,  sqs: 0.25,  P: 0.42,  J: 0.33 },
      CloseDrawer:  { Q: 0.22, qwen: 0.18,  sqs: -0.03, P: 0.29,  J: 0.54 },
      PlaceCan:     { Q: 0.65, qwen: NaN,   sqs: 0.01,  P: 0.39,  J: 0.45 },
      PlaceSphere:  { Q: 0.89, qwen: 0.00,  sqs: 0.63,  P: 0.80,  J: 0.46 },
      PokeCube:     { Q: 0.64, qwen: -0.11, sqs: 0.17,  P: -0.06, J: -0.06 },
      StackCube:    { Q: 0.30, qwen: 0.19,  sqs: 0.20,  P: 0.45,  J: 0.44 },
      PlugCharger:  { Q: 0.87, qwen: -0.62, sqs: -0.38, P: -0.02, J: 0.84 },
      PegInsertion: { Q: 0.44, qwen: -0.24, sqs: 0.13,  P: -0.44, J: -0.55 },
    },
  },
};

// ---------------------------------------------------------------------------
// RQ4 — demo selection on the UR3 (successes out of 10).
// ---------------------------------------------------------------------------
SPECTRA.selection = [
  { task: 'StackCube', top: 9, random: 5 },
  { task: 'PlaceCan',  top: 9, random: 6 },
];

// ---------------------------------------------------------------------------
// Video wall. TODO: fill `q` with each rollout's score and drop the clips in
// static/videos/wall/. Add as many entries as you like.
// ---------------------------------------------------------------------------
SPECTRA.wallTasks = ['StackCube', 'PlaceSphere', 'PegInsertion', 'PlugCharger', 'PokeCube', 'CloseDrawer', 'PlaceCan'];
SPECTRA.wallPolicies = ['DP', 'ACT', 'π0.5'];
SPECTRA.wall = [];
SPECTRA.wallTasks.forEach(task => {
  SPECTRA.wallPolicies.forEach(policy => {
    const slug = policy.replace('π0.5', 'pi05').toLowerCase();
    SPECTRA.wall.push({
      task, policy,
      video: `static/videos/wall/${task}_${slug}.mp4`,
      q: null,        // e.g. 0.82
      success: null,  // true / false
    });
  });
});
