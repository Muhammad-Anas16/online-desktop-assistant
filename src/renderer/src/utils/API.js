import axios from "axios";

const API_BASE_URL = "https://ai-api-sigma-indol.vercel.app";

export async function speechToText(audioBlob) {
  try {
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");

    const response = await axios.post(
      `${API_BASE_URL}/api/deepgramSTT`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );

    return {
      success: true,
      text: response.data?.text || "",
      raw: response.data,
    };
  } catch (error) {
    const message =
      error?.response?.data?.error ||
      error?.response?.data?.message ||
      error?.message ||
      "Speech to text failed";

    return {
      success: false,
      text: "",
      error: message,
    };
  }
}

export async function getAIReply(message) {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/aiReply`, {
      message,
    });

    return {
      success: true,
      reply: response.data?.reply || "",
      raw: response.data,
    };
  } catch (error) {
    const messageText =
      error?.response?.data?.error ||
      error?.response?.data?.message ||
      error?.message ||
      "AI reply failed";

    return {
      success: false,
      reply: "",
      error: messageText,
    };
  }
}
