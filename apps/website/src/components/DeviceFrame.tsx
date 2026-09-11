export function DeviceFrame({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={`relative mx-auto aspect-[9/19.5] w-[260px] rounded-[2.6rem] border-[6px] border-[#1a2320] bg-[#1a2320] shadow-[0_40px_90px_rgba(0,0,0,0.55)] sm:w-[288px] ${className}`}
    >
      <div className="absolute left-1/2 top-0 z-20 h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-[#1a2320]" />
      <div className="h-full w-full overflow-hidden rounded-[2.1rem] bg-white">{children}</div>
    </div>
  );
}
