export const parseDateString = (value: string): Date | null => {
  const regex = /^(?:\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4})$/;

  if (!regex.test(value)) {
    return null;
  }

  let normalized = value;
  if (/^\d{2}-\d{2}-\d{4}$/.test(value)) {
    normalized = value.replace(/(\d{2})-(\d{2})-(\d{4})/, "$3-$2-$1");
  }

  const date = new Date(normalized);
  return !isNaN(date.getTime()) ? date : null;
};

export const isValidDateString = (value: string): boolean => {
  return parseDateString(value) !== null;
};

export const formatDateWithOrdinal = (date: Date, locale: string = "en-US"): string => {
  if (isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
};
