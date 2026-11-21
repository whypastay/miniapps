export function demoRequested(): boolean {
  return new URLSearchParams(location.search).get('demo') === '1'
}
