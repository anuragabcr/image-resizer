"use client";
import React, { useState, useRef } from "react";
import Image from "next/image";

type ResizedImage = {
  dataUrl: string;
  name: string;
};

const App = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [minSize, setMinSize] = useState<number>(0);
  const [maxSize, setMaxSize] = useState<number>(0);
  const [resizedImages, setResizedImages] = useState<ResizedImage[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList) return;
    setSelectedFiles(Array.from(fileList));
    setResizedImages([]);
    setMessage("");
  };

  const handleConvert = async () => {
    if (selectedFiles.length === 0) {
      setMessage("Please select at least one image.");
      return;
    }
    if (minSize <= 0 || maxSize <= 0 || minSize > maxSize) {
      setMessage(
        "Please enter valid min and max dimensions (min > 0, max > 0, min <= max)."
      );
      return;
    }

    setLoading(true);
    setMessage("Resizing images...");
    setResizedImages([]);

    const newResizedImages: ResizedImage[] = [];

    for (const file of selectedFiles) {
      if (!file.type.startsWith("image/")) {
        setMessage(`Skipping non-image file: ${file.name}`);
        continue;
      }

      try {
        const reader = new FileReader();
        const imageDataUrl: string = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const img = new window.Image();
        img.src = imageDataUrl;

        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Failed to load image"));
        });

        const canvas = canvasRef.current;
        if (!canvas) {
          console.error("Canvas not available.");
          continue;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          console.error("Canvas context not available.");
          continue;
        }

        let newWidth = img.width;
        let newHeight = img.height;

        // Resize based on max
        if (newWidth > maxSize || newHeight > maxSize) {
          if (newWidth > newHeight) {
            newHeight = (newHeight / newWidth) * maxSize;
            newWidth = maxSize;
          } else {
            newWidth = (newWidth / newHeight) * maxSize;
            newHeight = maxSize;
          }
        }

        // Resize based on min
        if (newWidth < minSize || newHeight < minSize) {
          if (newWidth < newHeight) {
            newWidth = (newWidth / newHeight) * minSize;
            newHeight = minSize;
          } else {
            newHeight = (newHeight / newWidth) * minSize;
            newWidth = minSize;
          }
        }

        newWidth = Math.round(newWidth);
        newHeight = Math.round(newHeight);

        canvas.width = newWidth;
        canvas.height = newHeight;

        ctx.drawImage(img, 0, 0, newWidth, newHeight);
        const resizedDataUrl = canvas.toDataURL("image/png");

        newResizedImages.push({
          dataUrl: resizedDataUrl,
          name: `resized_${file.name}`,
        });
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        setMessage(`Failed to process ${file.name}. Please try again.`);
      }
    }

    setResizedImages(newResizedImages);
    setLoading(false);
    setMessage("Images resized successfully!");
  };

  const handleDownload = (dataUrl: string, filename: string) => {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-200 flex items-center justify-center p-4 font-sans">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-2xl transform transition-all duration-300 hover:scale-[1.01]">
        <h1 className="text-4xl font-extrabold text-center text-gray-800 mb-8 tracking-tight">
          Image Resizer
        </h1>

        <div className="mb-6">
          <label
            htmlFor="file-upload"
            className="block text-lg font-semibold text-gray-700 mb-2"
          >
            Select Images:
          </label>
          <input
            id="file-upload"
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-600
                       file:mr-4 file:py-2 file:px-4
                       file:rounded-full file:border-0
                       file:text-sm file:font-semibold
                       file:bg-blue-50 file:text-blue-700
                       hover:file:bg-blue-100 cursor-pointer rounded-lg border border-gray-300 p-2"
          />
          {selectedFiles.length > 0 && (
            <p className="mt-2 text-sm text-gray-500">
              {selectedFiles.length} file(s) selected.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <label
              htmlFor="min-size"
              className="block text-lg font-semibold text-gray-700 mb-2"
            >
              Min Dimension (px):
            </label>
            <input
              id="min-size"
              type="number"
              value={minSize}
              onChange={(e) => setMinSize(Number(e.target.value))}
              placeholder="e.g., 100"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent transition duration-200"
            />
          </div>
          <div>
            <label
              htmlFor="max-size"
              className="block text-lg font-semibold text-gray-700 mb-2"
            >
              Max Dimension (px):
            </label>
            <input
              id="max-size"
              type="number"
              value={maxSize}
              onChange={(e) => setMaxSize(Number(e.target.value))}
              placeholder="e.g., 800"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent transition duration-200"
            />
          </div>
        </div>

        <button
          onClick={handleConvert}
          disabled={
            loading ||
            selectedFiles.length === 0 ||
            minSize <= 0 ||
            maxSize <= 0 ||
            minSize > maxSize
          }
          className={`w-full py-3 px-6 rounded-xl text-white font-bold text-lg shadow-md transition duration-300 ease-in-out
            ${
              loading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 hover:shadow-lg active:bg-blue-800"
            }`}
        >
          {loading ? "Resizing..." : "Convert Images"}
        </button>

        {message && (
          <p
            className={`mt-6 text-center text-lg ${
              message.includes("Failed") ? "text-red-600" : "text-green-600"
            }`}
          >
            {message}
          </p>
        )}

        {resizedImages.length > 0 && (
          <div className="mt-10 border-t pt-8 border-gray-200">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
              Resized Images
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {resizedImages.map((image, index) => (
                <div
                  key={index}
                  className="bg-gray-50 p-4 rounded-xl shadow-sm flex flex-col items-center justify-between"
                >
                  <Image
                    src={image.dataUrl}
                    alt={image.name}
                    width={150}
                    height={150}
                    unoptimized
                    className="max-w-full h-auto rounded-lg mb-4 border border-gray-200"
                  />
                  <p className="text-sm font-medium text-gray-700 text-center mb-3 break-words">
                    {image.name}
                  </p>
                  <button
                    onClick={() => handleDownload(image.dataUrl, image.name)}
                    className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition duration-200 text-sm"
                  >
                    Download
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
};

export default App;
