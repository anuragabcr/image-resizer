"use client";
import React, { useState, useRef } from "react";
import Image from "next/image";
import JSZip from "jszip";

type ResizedImage = {
  dataUrl: string;
  name: string;
};

const App = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [minSize, setMinSize] = useState<number>(0); // For dimension resizing (pixels)
  const [maxSize, setMaxSize] = useState<number>(0); // For dimension resizing (pixels)
  const [minFileSize, setMinFileSize] = useState<number>(0); // For file size resizing (KB)
  const [maxFileSize, setMaxSizeFile] = useState<number>(0); // For file size resizing (KB)
  const [resizeMode, setResizeMode] = useState<"dimensions" | "fileSize">(
    "dimensions"
  ); // 'dimensions' or 'fileSize'

  const [resizedImages, setResizedImages] = useState<ResizedImage[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [downloadingAll, setDownloadingAll] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Helper function to convert Data URL to Blob for size calculation
  const dataURLtoBlob = (dataurl: string) => {
    const arr = dataurl.split(",");
    // Extract MIME type from the data URL
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : "image/png"; // Default to png if mime not found
    const bstr = atob(arr[1]); // Decode base64 string
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n); // Fill Uint8Array with character codes
    }
    return new Blob([u8arr], { type: mime }); // Create Blob
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList) return;
    setSelectedFiles(Array.from(fileList));
    setResizedImages([]);
    setMessage("");
  };

  const handleConvert = async () => {
    // Validate inputs based on selected resize mode
    if (selectedFiles.length === 0) {
      setMessage("Please select at least one image.");
      return;
    }

    if (resizeMode === "dimensions") {
      if (minSize <= 0 || maxSize <= 0 || minSize > maxSize) {
        setMessage(
          "Please enter valid min and max dimensions (min > 0, max > 0, min <= max)."
        );
        return;
      }
    } else {
      // resizeMode === 'fileSize'
      if (minFileSize <= 0 || maxFileSize <= 0 || minFileSize > maxFileSize) {
        setMessage(
          "Please enter valid min and max file sizes (min > 0, max > 0, min <= max)."
        );
        return;
      }
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

        let resizedDataUrl = "";
        let outputFileName = "";

        if (resizeMode === "dimensions") {
          // --- Dimension-based resizing logic ---
          let newWidth = img.width;
          let newHeight = img.height;

          // Resize based on max dimension
          if (newWidth > maxSize || newHeight > maxSize) {
            if (newWidth > newHeight) {
              newHeight = (newHeight / newWidth) * maxSize;
              newWidth = maxSize;
            } else {
              newWidth = (newWidth / newHeight) * maxSize;
              newHeight = maxSize;
            }
          }

          // Resize based on min dimension
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
          resizedDataUrl = canvas.toDataURL("image/png"); // Keep original format if possible
          outputFileName = `resized_dim_${file.name}`;
        } else {
          // --- File Size-based resizing logic ---
          let currentQuality = 0.9; // Start with high quality for JPEG
          let currentWidth = img.width;
          let currentHeight = img.height;
          let currentFileSizeKB = 0;
          const maxIterations = 100; // Limit iterations to prevent infinite loops
          let iterations = 0;
          let lastValidDataUrl = ""; // Stores the last data URL that was within range or closest
          let lastValidFileSizeKB = 0;

          // Function to update canvas, draw image, and get size
          const updateCanvasAndGetSize = (
            width: number,
            height: number,
            quality: number
          ): { dataUrl: string; sizeKB: number } => {
            canvas.width = width;
            canvas.height = height;
            ctx.clearRect(0, 0, width, height); // Clear canvas before drawing
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL("image/jpeg", quality); // Always output as JPEG for size control
            const sizeKB = dataURLtoBlob(dataUrl).size / 1024;
            return { dataUrl, sizeKB };
          };

          // Initial check with current dimensions and quality
          const { dataUrl: initialDataUrl, sizeKB: initialSizeKB } =
            updateCanvasAndGetSize(currentWidth, currentHeight, currentQuality);
          currentFileSizeKB = initialSizeKB;
          resizedDataUrl = initialDataUrl;

          // If the image is already within the desired range or smaller than min, we are done.
          if (
            currentFileSizeKB >= minFileSize &&
            currentFileSizeKB <= maxFileSize
          ) {
            lastValidDataUrl = resizedDataUrl;
            lastValidFileSizeKB = currentFileSizeKB;
          } else if (currentFileSizeKB < minFileSize) {
            // Image is already smaller than the minimum desired size.
            // We accept it as is, as upsizing by adding data is generally not desirable.
            lastValidDataUrl = resizedDataUrl;
            lastValidFileSizeKB = currentFileSizeKB;
            setMessage(
              `Image ${
                file.name
              } is already smaller than ${minFileSize}KB (${currentFileSizeKB.toFixed(
                2
              )}KB). Keeping original.`
            );
          } else {
            // Image is too large, start iterative reduction
            while (
              currentFileSizeKB > maxFileSize &&
              iterations < maxIterations
            ) {
              iterations++;

              // Prioritize quality reduction first
              if (currentQuality > 0.1) {
                currentQuality = Math.max(0.1, currentQuality - 0.05); // Reduce quality by 5%
              } else {
                // If quality is at its minimum, reduce dimensions
                const scaleFactor = 0.9; // Reduce dimensions by 10%
                currentWidth *= scaleFactor;
                currentHeight *= scaleFactor;
                currentWidth = Math.round(currentWidth);
                currentHeight = Math.round(currentHeight);

                // Ensure dimensions don't go below 1x1
                if (currentWidth < 1) currentWidth = 1;
                if (currentHeight < 1) currentHeight = 1;
              }

              const { dataUrl: newDataUrl, sizeKB: newSizeKB } =
                updateCanvasAndGetSize(
                  currentWidth,
                  currentHeight,
                  currentQuality
                );
              currentFileSizeKB = newSizeKB;
              resizedDataUrl = newDataUrl;

              // If we crossed the max threshold and are now within or below it, store this as potentially optimal
              if (currentFileSizeKB <= maxFileSize) {
                lastValidDataUrl = resizedDataUrl;
                lastValidFileSizeKB = currentFileSizeKB;
                if (currentFileSizeKB >= minFileSize) {
                  // We found a size within the target range, break the loop
                  break;
                }
              }
            }

            // After the loop, use the last valid data URL if found, otherwise use the last generated one.
            if (lastValidDataUrl) {
              resizedDataUrl = lastValidDataUrl;
              currentFileSizeKB = lastValidFileSizeKB;
            } else {
              // Fallback: if no valid size was found within iterations, use the last generated one
              setMessage(
                `Could not perfectly resize ${
                  file.name
                } to target file size. Closest size: ${currentFileSizeKB.toFixed(
                  2
                )}KB`
              );
            }
          }
          // Ensure the output file name has a .jpeg extension
          outputFileName = `resized_filesize_${file.name
            .split(".")
            .slice(0, -1)
            .join(".")}.jpeg`;
        }

        newResizedImages.push({
          dataUrl: resizedDataUrl,
          name: outputFileName,
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

  const handleDownloadAll = async () => {
    if (resizedImages.length === 0) {
      setMessage("No images to download.");
      return;
    }

    setDownloadingAll(true); // Show downloading indicator
    setMessage("Preparing zip file...");

    try {
      const zip = new JSZip();

      for (const image of resizedImages) {
        const response = await fetch(image.dataUrl);
        const blob = await response.blob();
        zip.file(image.name, blob);
      }

      const content = await zip.generateAsync({ type: "blob" });

      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      link.download = "resized_images.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      setMessage("All images downloaded as a zip file!");
    } catch (error) {
      console.error("Error zipping and downloading images:", error);
      setMessage("Failed to create zip file. Please try again.");
    } finally {
      setDownloadingAll(false); // Hide downloading indicator
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-200 flex items-center justify-center p-4 font-sans">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-2xl transform transition-all duration-300 hover:scale-[1.01]">
        <h1 className="text-4xl font-extrabold text-center text-gray-800 mb-8 tracking-tight">
          Image Resizer
        </h1>

        {/* Resize Mode Selection */}
        <div className="mb-6 flex justify-center space-x-6">
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="radio"
              className="form-radio h-5 w-5 text-blue-600"
              name="resizeMode"
              value="dimensions"
              checked={resizeMode === "dimensions"}
              onChange={() => setResizeMode("dimensions")}
            />
            <span className="ml-2 text-lg font-semibold text-gray-700">
              Resize by Dimensions (px)
            </span>
          </label>
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="radio"
              className="form-radio h-5 w-5 text-blue-600"
              name="resizeMode"
              value="fileSize"
              checked={resizeMode === "fileSize"}
              onChange={() => setResizeMode("fileSize")}
            />
            <span className="ml-2 text-lg font-semibold text-gray-700">
              Resize by File Size (KB)
            </span>
          </label>
        </div>

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

        {/* Conditional Input Fields based on Resize Mode */}
        {resizeMode === "dimensions" && (
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
        )}

        {resizeMode === "fileSize" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <label
                htmlFor="min-file-size"
                className="block text-lg font-semibold text-gray-700 mb-2"
              >
                Min File Size (KB):
              </label>
              <input
                id="min-file-size"
                type="number"
                value={minFileSize}
                onChange={(e) => setMinFileSize(Number(e.target.value))}
                placeholder="e.g., 25"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent transition duration-200"
              />
            </div>
            <div>
              <label
                htmlFor="max-file-size"
                className="block text-lg font-semibold text-gray-700 mb-2"
              >
                Max File Size (KB):
              </label>
              <input
                id="max-file-size"
                type="number"
                value={maxFileSize}
                onChange={(e) => setMaxSizeFile(Number(e.target.value))}
                placeholder="e.g., 50"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent transition duration-200"
              />
            </div>
          </div>
        )}

        <button
          onClick={handleConvert}
          disabled={
            loading ||
            selectedFiles.length === 0 ||
            (resizeMode === "dimensions" &&
              (minSize <= 0 || maxSize <= 0 || minSize > maxSize)) ||
            (resizeMode === "fileSize" &&
              (minFileSize <= 0 ||
                maxFileSize <= 0 ||
                minFileSize > maxFileSize))
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
              message.includes("Failed") || message.includes("Could not")
                ? "text-red-600"
                : "text-green-600"
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
            {/* Download All Button */}
            <div className="mb-6 text-center">
              <button
                onClick={handleDownloadAll}
                disabled={downloadingAll || resizedImages.length === 0}
                className={`py-3 px-8 rounded-xl text-white font-bold text-lg shadow-md transition duration-300 ease-in-out
                  ${
                    downloadingAll
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-purple-600 hover:bg-purple-700 hover:shadow-lg active:bg-purple-800"
                  }`}
              >
                {downloadingAll ? "Zipping..." : "Download All as ZIP"}
              </button>
            </div>
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
        {/* Hidden canvas for image processing */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
};

export default App;
