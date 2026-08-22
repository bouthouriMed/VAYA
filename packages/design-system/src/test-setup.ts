// react-test-renderer (React 19) requires this flag or every act() call
// warns "The current testing environment is not configured to support
// act(...)" even though the render itself is correct.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
