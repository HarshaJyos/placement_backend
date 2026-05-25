export interface CursorPayload {
  sortValue: any;
  id: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    cursor: string | null;
    has_next: boolean;
    total: number;
  };
}

export interface PaginateOptions {
  limit: number;
  cursor?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  tieBreakerField?: string;
}

// Encodes a cursor payload into a base64 string
export const encodeCursor = (payload: CursorPayload): string => {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
};

// Decodes a base64 cursor string into a CursorPayload
export const decodeCursor = (cursorStr: string): CursorPayload | null => {
  try {
    const jsonStr = Buffer.from(cursorStr, "base64").toString("utf-8");
    return JSON.parse(jsonStr) as CursorPayload;
  } catch (err) {
    return null;
  }
};

// High-performance cursor-based pagination helper for Prisma
export async function paginate<T extends { id: string; [key: string]: any }>(
  modelDelegate: {
    findMany: (args: any) => Promise<T[]>;
    count: (args: any) => Promise<number>;
  },
  baseArgs: any = {},
  options: PaginateOptions
): Promise<PaginatedResult<T>> {
  const limit = Math.min(options.limit || 20, 100);
  const sortBy = options.sortBy || "createdAt";
  const sortOrder = options.sortOrder || "desc";
  const tieBreakerField = options.tieBreakerField || "id";

  const cursorData = options.cursor ? decodeCursor(options.cursor) : null;
  const where = { ...(baseArgs.where || {}) };

  // Apply cursor conditions dynamically based on sorting direction
  if (cursorData) {
    const { sortValue, id } = cursorData;
    const isDesc = sortOrder === "desc";

    if (sortBy === tieBreakerField) {
      where[tieBreakerField] = isDesc ? { lt: id } : { gt: id };
    } else {
      where.OR = [
        {
          [sortBy]: isDesc ? { lt: sortValue } : { gt: sortValue },
        },
        {
          [sortBy]: sortValue,
          [tieBreakerField]: { gt: id }, // ID tie-breaker is always ascending
        },
      ];
    }
  }

  // Fetch limit + 1 items to determine if a next page exists
  const items = await modelDelegate.findMany({
    ...baseArgs,
    where,
    orderBy: [
      { [sortBy]: sortOrder },
      { [tieBreakerField]: "asc" },
    ],
    take: limit + 1,
  });

  const total = await modelDelegate.count({ where: baseArgs.where });

  const hasNext = items.length > limit;
  const data = hasNext ? items.slice(0, limit) : items;

  let nextCursor: string | null = null;
  if (hasNext && data.length > 0) {
    const lastItem = data[data.length - 1];
    nextCursor = encodeCursor({
      sortValue: lastItem[sortBy],
      id: lastItem.id,
    });
  }

  return {
    data,
    pagination: {
      cursor: nextCursor,
      has_next: hasNext,
      total,
    },
  };
}
