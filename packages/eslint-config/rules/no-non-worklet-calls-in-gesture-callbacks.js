/**
 * vaya/no-non-worklet-calls-in-gesture-callbacks
 *
 * Root-cause enforcement for the "app silently closes to home screen" crash
 * class (seen twice in production code: DateCalendarSheet.settleGrid,
 * BottomSheet.isDismissalDrag).
 *
 * Contract being enforced: react-native-gesture-handler builder callbacks
 * (.onBegin/.onStart/.onUpdate/.onEnd/.onFinalize/.onTouches*) and
 * react-native-reanimated worklet contexts (useAnimatedStyle,
 * useDerivedValue, useAnimatedReaction, useFrameCallback, and the completion
 * callbacks of withTiming/withSpring/...) are auto-workletized by babel and
 * EXECUTE ON THE UI THREAD. From there you may only:
 *
 *   1. touch shared values / reanimated injectables (withTiming, withSpring,
 *      interpolate, ...),
 *   2. call platform built-ins (Math.*, Date, ...) — member expressions pass
 *      this rule by construction,
 *   3. call another function that carries the 'worklet' directive,
 *   4. marshal out to the JS thread via runOnJS(fn)(...).
 *
 * A violation throws on the UI thread, where there is no LogBox/redbox — on
 * iOS/Fabric the process dies outright and the app bounces to the home
 * screen with zero diagnostics. Unit tests cannot catch this (helpers run
 * fine on the JS thread), which is why static enforcement is load-bearing.
 *
 * Limitations (documented, deliberate):
 *   - Only inline function arguments are inspected (that is exactly the set
 *     babel auto-workletizes). A referenced named handler must carry its own
 *     'worklet' directive and is not traversed.
 *   - Imported/undeclared identifiers are skipped (cannot be verified
 *     syntactically). Locally-declared functions ARE verified.
 */
const GESTURE_CALLBACK_METHODS = new Set([
  'onBegin',
  'onStart',
  'onUpdate',
  'onEnd',
  'onFinalize',
  'onTouchesDown',
  'onTouchesMove',
  'onTouchesUp',
  'onTouchesCancel',
]);

// Hooks whose function arguments are auto-workletized by reanimated.
const WORKLET_HOOK_NAMES = new Set([
  'useAnimatedStyle',
  'useDerivedValue',
  'useAnimatedReaction',
  'useFrameCallback',
  'useWorkletCallback',
]);

// Animation builders whose trailing function argument (the completion
// callback) runs on the UI thread.
const ANIMATION_BUILDER_NAMES = new Set([
  'withTiming',
  'withSpring',
  'withDelay',
  'withRepeat',
  'withSequence',
]);

// Identifiers reanimated/RNGH document as injectable into worklets. Anything
// here is safe to call directly from a worklet context.
const WORKLET_SAFE_IDENTIFIERS = new Set([
  'withTiming',
  'withSpring',
  'withDelay',
  'withRepeat',
  'withSequence',
  'cancelAnimation',
  'runOnJS',
  'runOnUI',
  'interpolate',
  'interpolateColor',
  'clamp',
  'measure',
  'processColor',
  'isWorklet',
]);

function isFunctionNode(node) {
  return node !== null && typeof node === 'object' && (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression');
}

function hasWorkletDirective(fnNode) {
  const body = fnNode.body;
  if (!body || body.type !== 'BlockStatement' || body.body.length === 0) {
    return false;
  }
  const first = body.body[0];
  return (
    first.type === 'ExpressionStatement' &&
    first.expression.type === 'Literal' &&
    first.expression.value === 'worklet'
  );
}

/** Collects name -> function node for every locally-declared function in the file. */
function collectLocalFunctions(ast) {
  const map = new Map();
  (function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node.type !== 'string') return;
    if (node.type === 'FunctionDeclaration' && node.id && node.id.type === 'Identifier') {
      map.set(node.id.name, node);
    } else if (
      node.type === 'VariableDeclarator' &&
      node.id.type === 'Identifier' &&
      isFunctionNode(node.init)
    ) {
      map.set(node.id.name, node.init);
    }
    for (const key of Object.keys(node)) {
      if (key === 'parent' || key === 'loc' || key === 'range') continue;
      visit(node[key]);
    }
  })(ast);
  return map;
}

/** Invokes `onCall` for every CallExpression reachable below `node`. */
function walkCalls(node, onCall) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((item) => walkCalls(item, onCall));
    return;
  }
  if (typeof node.type !== 'string') return;
  if (node.type === 'CallExpression') {
    onCall(node);
  }
  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue;
    walkCalls(node[key], onCall);
  }
}

function checkInnerCall(callNode, localFns, context) {
  const callee = callNode.callee;
  // Member expressions (Math.abs(...), ref.current.foo()) and anything
  // non-identifier are outside this rule's syntactic reach.
  if (!callee || callee.type !== 'Identifier') return;
  const name = callee.name;

  // The explicit marshaling boundary: its argument is intentionally a
  // non-worklet JS-thread function.
  if (name === 'runOnJS' || name === 'runOnUI') return;
  if (WORKLET_SAFE_IDENTIFIERS.has(name)) return;

  const declaration = localFns.get(name);
  if (!declaration) return; // imported or global — not statically verifiable

  if (!hasWorkletDirective(declaration)) {
    context.report({
      node: callNode,
      message:
        `'${name}' is called inside a worklet context (gesture callback / animated hook), which runs on the UI thread. ` +
        `'${name}' has no 'worklet' directive: this throws where no redbox exists — on iOS/Fabric the process dies and the app silently closes. ` +
        `Either mark '${name}' with a leading 'worklet' directive (if it only touches shared values / reanimated APIs) ` +
        `or invoke it via runOnJS(${name})(...) (if it touches JS-thread state like setState/navigation).`,
    });
  }
}

function inspectWorkletCallbacks(context, callNode, filterArgs) {
  const args = filterArgs(callNode);
  const localFns = collectLocalFunctions(context.sourceCode.ast);
  for (const arg of args) {
    walkCalls(arg.body, (inner) => checkInnerCall(inner, localFns, context));
  }
}

export default {
  meta: {
    type: 'problem',
    schema: [],
    docs: {
      description:
        'Forbids calling non-worklet local functions inside RNGH gesture callbacks and reanimated worklet contexts.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;

        // Case 1: RNGH gesture builder callbacks (.onUpdate(handler), ...)
        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.property.type === 'Identifier' &&
          GESTURE_CALLBACK_METHODS.has(callee.property.name)
        ) {
          inspectWorkletCallbacks(context, node, (call) => call.arguments.filter(isFunctionNode));
          return;
        }

        if (callee.type !== 'Identifier') return;

        // Case 2: reanimated hooks taking worklet function arguments
        if (WORKLET_HOOK_NAMES.has(callee.name)) {
          inspectWorkletCallbacks(context, node, (call) => call.arguments.filter(isFunctionNode));
          return;
        }

        // Case 3: animation builders whose completion callback is a worklet
        if (ANIMATION_BUILDER_NAMES.has(callee.name)) {
          inspectWorkletCallbacks(context, node, (call) => call.arguments.filter(isFunctionNode));
        }
      },
    };
  },
};
