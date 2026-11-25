export const cacheKeys = {
  milkEntriesByDate: (
  adminId: string,
  date: string,
  page: number,
  limit: number
) =>
  `milk-entries-by-date:${adminId}:${date}:${page}:${limit}`,


    todayMilkEntries: (
  adminId: string,
  date: string
) =>
  `today-milk-entries:${adminId}:${date}`,

  adminSession: (adminId: string) => `session:admin:${adminId}`,
};
